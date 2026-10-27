import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { paypal, sandboxEnabled } from "./paypal";
import { mockStore, mockTrace } from "@/mock/store";
import { validateId } from "./validation";
import type { Dispute, TraceEntry } from "./types";

export type ApiContext = { session: string; mode: "mock" | "sandbox"; trace: TraceEntry[] };
export type RouteParams = { params: Promise<{ id: string }> };
export async function api(request: Request, work: (ctx: ApiContext) => Promise<Record<string, unknown>>) {
  const cookie = request.headers.get("cookie")?.split(";").map(c => c.trim()).find(c => c.startsWith("court-session="))?.split("=")[1];
  const session = cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : crypto.randomUUID();
  const ctx: ApiContext = { session, mode: sandboxEnabled() ? "sandbox" : "mock", trace: [] };
  let result: Record<string, unknown>, status = 200; let retryAfter: number | undefined;
  try { result = await work(ctx); }
  catch (error) {
    status = error instanceof AppError ? error.status : 500;
    retryAfter = error instanceof AppError ? error.retryAfter : undefined;
    result = { error: error instanceof AppError ? error.message : "The case could not be processed. Please try again." };
  }
  const response = NextResponse.json({ ...result, mode: ctx.mode, trace: ctx.trace }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
  if (cookie !== session) response.cookies.set("court-session", session, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", maxAge: 86_400, path: "/" });
  return response;
}
export async function getCase(ctx: ApiContext, id: string): Promise<Dispute> {
  validateId(id);
  if (ctx.mode === "sandbox") return paypal().detail(id, ctx.trace);
  try { const value = mockStore.get(ctx.session, id); mockTrace(ctx.trace, "GET", id); return value; }
  catch (error) { mockTrace(ctx.trace, "GET", id); ctx.trace[ctx.trace.length - 1].status = 404; throw error; }
}

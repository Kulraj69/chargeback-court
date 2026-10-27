import { api } from "@/lib/api";
import { paypal } from "@/lib/paypal";
import { scoreCase } from "@/lib/verdict";
import { mockStore, mockTrace } from "@/mock/store";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(request, async ctx => {
    const query = new URL(request.url).searchParams;
    const size = Number(query.get("page_size") ?? 50);
    if (!Number.isInteger(size) || size < 1 || size > 50) throw new AppError("Page size must be between 1 and 50.");
    if (ctx.mode === "sandbox") {
      const result = await paypal().list(ctx.trace, size, query.get("next") ?? undefined);
      return { ...result, disputes: result.disputes.map(d => ({ ...d, verdict: scoreCase(d, d) })) };
    }
    const all = mockStore.list(ctx.session); const offset = Number(query.get("next") ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > all.length) throw new AppError("Invalid demo page.");
    mockTrace(ctx.trace, "GET");
    return { disputes: all.slice(offset, offset + size).map(d => ({ ...d, verdict: scoreCase(d, d) })), next: offset + size < all.length ? String(offset + size) : undefined };
  });
}

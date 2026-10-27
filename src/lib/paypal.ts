import { AppError } from "./errors";
import type { ActionInput, Dispute, Money, TraceEntry, Transaction } from "./types";

// Intentionally not configurable. This application cannot call PayPal production.
export const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";
export const DISPUTES_PATH = "/v1/customer/disputes";
import { ACTION_PATHS } from "./actions";
export { ACTION_PATHS } from "./actions";
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function string(value: unknown, fallback = ""): string { return typeof value === "string" ? value.slice(0, 4000) : fallback; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function date(value: unknown): string | undefined {
  const s = string(value); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : undefined;
}
function parseMoney(value: unknown): Money {
  const r = record(value); const n = typeof r.value === "string" || typeof r.value === "number" ? Number(r.value) : NaN;
  return { currency: /^[A-Z]{3}$/.test(string(r.currency_code)) ? string(r.currency_code) : "USD", value: Number.isFinite(n) && n >= 0 ? n : 0 };
}
export function parseDispute(raw: unknown): Dispute {
  const d = record(raw); const tx = record(array(d.disputed_transactions)[0]);
  const buyer = record(tx.buyer ?? d.buyer); const name = record(buyer.name);
  const id = string(d.dispute_id);
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new AppError("PayPal returned an invalid dispute identifier.", 502);
  return {
    id, reason: string(d.reason, "UNKNOWN"), status: string(d.status, "UNKNOWN"),
    stage: string(d.dispute_life_cycle_stage, "UNKNOWN"), amount: parseMoney(d.dispute_amount),
    amountAvailable: /^[A-Z]{3}$/.test(string(record(d.dispute_amount).currency_code)) && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(record(d.dispute_amount).value ?? "")) && Number.isFinite(Number(record(d.dispute_amount).value)),
    due: date(d.seller_response_due_date), created: date(d.create_time), updated: date(d.update_time),
    buyer: string(buyer.name) || [string(name.given_name), string(name.surname)].filter(Boolean).join(" ") || string(buyer.email, "Buyer name unavailable"),
    transactionId: string(tx.seller_transaction_id) || undefined, transactionAt: date(tx.create_time),
    messages: array(d.messages).slice(-100).map(m => { const r = record(m); return { at: date(r.time_posted) ?? "", actor: string(r.posted_by, "PARTY"), text: string(r.content) }; }),
    outcome: string(record(d.dispute_outcome).outcome_code) || undefined,
    evidence: [], // A PayPal document does not prove that the seller has checked our specific checklist.
    availableActions: array(d.links).map(l => string(record(l).rel)),
  };
}
export function parseTransaction(raw: unknown, id: string): Transaction | undefined {
  const row = array(record(raw).transaction_details).find(r => string(record(record(r).transaction_info).transaction_id) === id);
  if (!row) return undefined;
  const r = record(row), tx = record(r.transaction_info), ship = record(record(r.shipping_info).address), payer = record(r.payer_info);
  const name = record(payer.payer_name);
  return {
    id, at: date(tx.transaction_initiation_date), amount: parseMoney(tx.transaction_amount), status: string(tx.transaction_status),
    payer: string(name.alternate_full_name) || [string(name.given_name), string(name.surname)].filter(Boolean).join(" "),
    item: array(record(r.cart_info).item_details).map(i => string(record(i).item_name)).filter(Boolean).join(", "),
    shippingAddress: [ship.line1, ship.line2, ship.city, ship.state, ship.postal_code, ship.country_code].filter(v => typeof v === "string").join(", "),
  };
}
export function transactionPath(id: string, start: string, end: string): string {
  const from = Date.parse(start), to = Date.parse(end);
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id) || !Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 31 * 86_400_000) throw new AppError("Transaction searches must use a valid window of at most 31 days.");
  return `/v1/reporting/transactions?${new URLSearchParams({ transaction_id: id, start_date: new Date(from).toISOString(), end_date: new Date(to).toISOString(), fields: "all" })}`;
}
export function safeNextPath(href: string): string {
  let u: URL;
  try { u = new URL(href, PAYPAL_BASE); } catch { throw new AppError("Invalid PayPal pagination link."); }
  if (u.origin !== PAYPAL_BASE || u.pathname !== DISPUTES_PATH || u.username || u.password || u.hash || u.search.length > 2000) throw new AppError("Invalid PayPal pagination link.");
  return `${u.pathname}${u.search}`;
}
export function buildActionBody(action: ActionInput, currency: string): FormData | string {
  if (action.type === "evidence") {
    const form = new FormData();
    const tracked = action.evidence.includes("tracking") && action.tracking?.number && action.tracking.carrier;
    const documents = (action.attachments ?? []).map((file, i) => {
      const name = `evidence-${i + 1}`;
      form.append(name, new Blob([Buffer.from(file.base64, "base64")], { type: file.mime }), file.name);
      return { name: file.name };
    });
    const evidence = {
      evidence_type: tracked ? "PROOF_OF_FULFILLMENT" : "OTHER",
      ...(tracked ? { evidence_info: { tracking_info: [{ carrier_name: action.tracking!.carrier, tracking_number: action.tracking!.number }] } } : {}),
      notes: action.note,
      ...(documents.length ? { documents } : {}),
    };
    form.append("input", new Blob([JSON.stringify({ evidences: [evidence] })], { type: "application/json" }));
    return form;
  }
  if (action.type === "message") { const form = new FormData(); form.append("message", action.note ?? ""); return form; }
  if (action.type === "offer") return JSON.stringify({ note: action.note, offer_amount: { currency_code: currency, value: action.offerAmount }, offer_type: "REFUND" });
  if (action.type === "accept") return JSON.stringify({ note: action.note });
  if (action.type === "sandbox_require_evidence") return JSON.stringify({ action: "SELLER_EVIDENCE" });
  return JSON.stringify({ adjudication_outcome: action.outcome });
}
export class PayPalClient {
  private token?: { value: string; expires: number };
  private pending?: Promise<string>;
  constructor(private clientId: string, private secret: string, private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {}
  private async call(path: string, init: RequestInit, trace: TraceEntry[]): Promise<Response> {
    if (!path.startsWith("/v1/") && !path.startsWith("/v2/")) throw new AppError("Unsupported PayPal path.");
    const started = this.now(); let status = 0;
    try {
      const response = await this.fetcher(`${PAYPAL_BASE}${path}`, { ...init, signal: AbortSignal.timeout(12_000), cache: "no-store", redirect: "error" });
      status = response.status; return response;
    } catch { throw new AppError("PayPal sandbox could not be reached. Please try again.", 502); }
    finally {
      trace.push({ id: crypto.randomUUID(), at: new Date(started).toISOString(), method: init.method ?? "GET", path: path.split("?")[0], status, ms: Math.max(0, this.now() - started), mode: "sandbox" });
    }
  }
  async accessToken(trace: TraceEntry[]): Promise<string> {
    if (this.token && this.now() < this.token.expires) return this.token.value;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const response = await this.call("/v1/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }, trace);
      if (!response.ok) throw new AppError("PayPal sandbox authentication failed. Check the server's sandbox credentials.", 502);
      const body = record(await response.json());
      if (typeof body.access_token !== "string" || !body.access_token || !Number.isFinite(Number(body.expires_in)) || Number(body.expires_in) <= 0) throw new AppError("PayPal returned an invalid OAuth response.", 502);
      this.token = { value: body.access_token, expires: this.now() + Math.max(0, Number(body.expires_in) - 60) * 1000 };
      return this.token.value;
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  async request(path: string, trace: TraceEntry[], body?: FormData | string): Promise<unknown> {
    const token = await this.accessToken(trace);
    const response = await this.call(path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body }, trace);
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      // Never relay provider error bodies: they can include request data or credentials.
      throw new AppError(response.status === 404 ? "This sandbox dispute was not found." : `PayPal sandbox rejected this request (HTTP ${response.status}). Refresh the case and check the available actions.`, response.status === 404 ? 404 : 502);
    }
    if (response.status === 204) return {};
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { throw new AppError("PayPal returned an unreadable response.", 502); }
  }
  async list(trace: TraceEntry[], pageSize = 50, next?: string): Promise<{ disputes: Dispute[]; next?: string }> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new AppError("Page size must be between 1 and 50.");
    const raw = record(await this.request(next ? safeNextPath(next) : `${DISPUTES_PATH}?page_size=${pageSize}`, trace));
    const link = array(raw.links).map(record).find(l => l.rel === "next");
    return { disputes: array(raw.items).map(parseDispute), next: link ? safeNextPath(string(link.href)) : undefined };
  }
  async detail(id: string, trace: TraceEntry[]): Promise<Dispute> {
    return parseDispute(await this.request(`${DISPUTES_PATH}/${encodeURIComponent(id)}`, trace));
  }
  async transaction(id: string, start: string, end: string, trace: TraceEntry[]): Promise<Transaction | undefined> {
    return parseTransaction(await this.request(transactionPath(id, start, end), trace), id);
  }
  async action(id: string, action: ActionInput, currency: string, trace: TraceEntry[]): Promise<void> {
    await this.request(`${DISPUTES_PATH}/${encodeURIComponent(id)}/${ACTION_PATHS[action.type]}`, trace, buildActionBody(action, currency));
  }
}
let singleton: PayPalClient | undefined;
export function sandboxEnabled(): boolean { return !!(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()); }
export function paypal(): PayPalClient {
  if (!sandboxEnabled()) throw new AppError("Sandbox credentials are not configured.", 503);
  return singleton ??= new PayPalClient(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!);
}

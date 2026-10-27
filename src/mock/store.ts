import { AppError } from "@/lib/errors";
import type { ActionInput, Dispute, EvidenceInput, TraceEntry } from "@/lib/types";
import { ACTION_PATHS, DISPUTES_PATH } from "@/lib/paypal";
import { syntheticDisputes } from "./disputes";

export class MockStore {
  private sessions = new Map<string, { cases: Dispute[]; touched: number }>();
  constructor(private maxSessions = 500, private ttl = 86_400_000) {}
  private session(id: string, now = Date.now()) {
    for (const [key, value] of this.sessions) if (now - value.touched > this.ttl) this.sessions.delete(key);
    let value = this.sessions.get(id);
    if (!value) {
      if (this.sessions.size >= this.maxSessions) this.sessions.delete(this.sessions.keys().next().value!);
      value = { cases: syntheticDisputes(now), touched: now }; this.sessions.set(id, value);
    }
    value.touched = now; return value;
  }
  list(session: string) { return structuredClone(this.session(session).cases); }
  get(session: string, id: string) {
    const value = this.session(session).cases.find(d => d.id === id);
    if (!value) throw new AppError("Case not found in this demo session.", 404);
    return structuredClone(value);
  }
  saveEvidence(session: string, id: string, input: EvidenceInput) {
    const value = this.session(session).cases.find(d => d.id === id);
    if (!value) throw new AppError("Case not found in this demo session.", 404);
    value.evidence = [...input.evidence]; value.tracking = input.tracking;
  }
  action(session: string, id: string, action: ActionInput) {
    const cases = this.session(session).cases, value = cases.find(d => d.id === id);
    if (!value) throw new AppError("Case not found in this demo session.", 404);
    if (value.status === "RESOLVED") throw new AppError("This case is already resolved.", 409);
    const at = new Date().toISOString();
    if (action.type === "sandbox_require_evidence") {
      if (value.status !== "UNDER_REVIEW") throw new AppError("Require evidence is available while a case is under review.", 409);
      value.status = "WAITING_FOR_SELLER_RESPONSE"; value.due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    }
    if (action.type === "sandbox_adjudicate") {
      if (value.status !== "UNDER_REVIEW") throw new AppError("Submit evidence before adjudicating this case.", 409);
      value.status = "RESOLVED"; value.outcome = action.outcome; value.due = undefined;
    }
    if (action.type === "evidence") {
      if (value.status !== "WAITING_FOR_SELLER_RESPONSE") throw new AppError("Evidence is available when awaiting the seller's response.", 409);
      value.status = "UNDER_REVIEW"; value.stage = "CHARGEBACK"; value.evidence = [...action.evidence]; value.tracking = action.tracking; value.due = undefined;
    }
    if (action.type === "offer") {
      if (value.stage !== "INQUIRY") throw new AppError("Offers are available during the inquiry stage.", 409);
      value.status = "WAITING_FOR_BUYER_RESPONSE"; value.due = undefined;
    }
    if (action.type === "accept") { value.status = "RESOLVED"; value.outcome = "BUYER_FAVOR"; value.due = undefined; }
    value.updated = at;
    value.messages.push({ at, actor: action.type.startsWith("sandbox_") ? "SANDBOX" : "SELLER", text: action.note || (action.type === "sandbox_adjudicate" ? `Synthetic adjudication: ${action.outcome}.` : "Seller evidence requested.") });
    if (action.type === "offer") value.messages.push({ at, actor: "SYSTEM", text: `Partial refund offer: ${value.amount.currency} ${action.offerAmount}. Awaiting buyer acceptance.` });
    if (action.attachments?.length) value.messages.push({ at, actor: "SYSTEM", text: `${action.attachments.length} synthetic demo attachment(s) filed. Contents are not retained.` });
    value.messages = value.messages.slice(-100);
    return structuredClone(value);
  }
}
const state = globalThis as typeof globalThis & { courtMockStore?: MockStore };
export const mockStore = state.courtMockStore ??= new MockStore();
export function mockTrace(trace: TraceEntry[], method: string, id?: string, action?: ActionInput["type"]) {
  trace.push({ id: crypto.randomUUID(), at: new Date().toISOString(), method, path: `${DISPUTES_PATH}${id ? `/${id}` : ""}${action ? `/${ACTION_PATHS[action]}` : ""}`, status: 200, ms: 0, mode: "mock" });
}

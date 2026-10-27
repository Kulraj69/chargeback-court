import { AppError } from "./errors";
import { record } from "./paypal";
import { checklist, EVIDENCE, roundMoney } from "./verdict";
import type { ActionInput, ActionType, Attachment, Dispute, EvidenceInput } from "./types";

export const MAX_BODY_BYTES = 3_000_000;
export const MAX_FILE_BYTES = 500_000;
export function validateId(id: string): string {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new AppError("Invalid case identifier.");
  return id;
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("Cross-site requests are not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError("Send an application/json body.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new AppError("The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("A JSON body is required.");
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new AppError("The request is too large.", 413); }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return record(parsed);
  } catch { throw new AppError("Invalid JSON body."); }
}
function boundedString(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AppError(`${label} must be ${required ? "1" : "0"}–${max} characters.`);
  return value.trim();
}
export function validateEvidence(body: Record<string, unknown>, reason?: string): EvidenceInput {
  if (!Array.isArray(body.evidence) || body.evidence.length > 20 || body.evidence.some(e => typeof e !== "string" || !Object.hasOwn(EVIDENCE, e))) throw new AppError("Select valid evidence checklist items.");
  const evidence = [...new Set(body.evidence as string[])];
  if (reason && evidence.some(e => !checklist(reason).some(i => i.id === e))) throw new AppError("This evidence does not belong to the case checklist.");
  let tracking: EvidenceInput["tracking"];
  if (body.tracking !== undefined) {
    const raw = record(body.tracking);
    const carrier = boundedString(raw.carrier, "Carrier", 100);
    const number = boundedString(raw.number, "Tracking number", 100);
    if (number && !/^[A-Za-z0-9 -]+$/.test(number)) throw new AppError("Tracking numbers may contain letters, digits, spaces and hyphens.");
    tracking = { carrier, number };
  }
  if (evidence.includes("tracking") && (!tracking?.carrier || !tracking.number)) throw new AppError("Enter a carrier and tracking number before confirming tracking evidence.");
  return { evidence, tracking };
}
function validateAttachments(value: unknown): Attachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new AppError("Attach up to three files.");
  return value.map(raw => {
    const f = record(raw); const name = boundedString(f.name, "Filename", 100, true);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/.test(name)) throw new AppError("Use a simple filename without path separators.");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(String(f.mime))) throw new AppError("Only PDF, PNG and JPEG evidence files are supported.");
    if (typeof f.base64 !== "string" || !f.base64 || f.base64.length > 670_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64)) throw new AppError("Invalid file encoding.");
    const bytes = Buffer.from(f.base64, "base64");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new AppError("Each file must be at most 500 KB.");
    const magic = f.mime === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : f.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!magic) throw new AppError("The file contents do not match its type.");
    return { name, mime: f.mime as string, base64: f.base64 };
  });
}
export function validateAction(body: Record<string, unknown>, dispute: Dispute): ActionInput {
  const types: ActionType[] = ["evidence", "offer", "accept", "message", "sandbox_require_evidence", "sandbox_adjudicate"];
  if (!types.includes(body.type as ActionType)) throw new AppError("Unknown action.");
  if (body.confirm !== true) throw new AppError("Explicit confirmation is required.");
  if (dispute.status === "RESOLVED") throw new AppError("This case is already resolved.", 409);
  const type = body.type as ActionType;
  if ((type === "accept" || type === "offer") && dispute.amountAvailable === false) throw new AppError("A valid dispute amount is required before a refund action.");
  const input = validateEvidence({ ...body, evidence: body.evidence ?? [] }, dispute.reason);
  const note = type.startsWith("sandbox_") ? undefined : boundedString(body.note, "Note", 2000, true);
  const action: ActionInput = { ...input, type, note, confirm: true };
  if (type === "evidence") {
    if (!input.evidence.length) throw new AppError("Confirm at least one evidence item before filing.");
    action.attachments = validateAttachments(body.attachments);
    if (new Set(action.attachments.map(f => f.name)).size !== action.attachments.length) throw new AppError("Attachment filenames must be unique.");
  }
  if (type === "offer") {
    if (typeof body.offerAmount !== "string" || !/^\d{1,9}(\.\d{1,3})?$/.test(body.offerAmount)) throw new AppError("Enter a valid partial refund amount.");
    const amount = Number(body.offerAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount >= dispute.amount.value || roundMoney(amount, dispute.amount.currency) !== amount) throw new AppError("The offer must be positive, below the dispute amount, and use the currency's precision.");
    action.offerAmount = amount.toFixed(new Intl.NumberFormat("en", { style: "currency", currency: dispute.amount.currency }).resolvedOptions().maximumFractionDigits ?? 2);
  }
  if (type === "sandbox_adjudicate") {
    if (body.outcome !== "BUYER_FAVOR" && body.outcome !== "SELLER_FAVOR") throw new AppError("Select a sandbox outcome.");
    action.outcome = body.outcome;
  }
  return action;
}

export type Money = { currency: string; value: number };
export type Tracking = { carrier: string; number: string };
export type EvidenceInput = { evidence: string[]; tracking?: Tracking };
export type Attachment = { name: string; mime: string; base64: string };
export type TimelineEvent = { at: string; actor: string; text: string };
export type Transaction = {
  id: string; at?: string; amount?: Money; status?: string;
  item?: string; shippingAddress?: string; payer?: string;
};
export type Dispute = {
  id: string; reason: string; status: string; stage: string;
  amount: Money; amountAvailable?: boolean; due?: string; created?: string; updated?: string;
  buyer: string; transactionId?: string; transactionAt?: string;
  messages: TimelineEvent[]; outcome?: string;
  evidence: string[]; tracking?: Tracking; transaction?: Transaction;
  availableActions?: string[];
};
export type TraceEntry = {
  id: string; at: string; method: string; path: string; status: number;
  ms: number; mode: "mock" | "sandbox";
};
export type ActionType = "evidence" | "offer" | "accept" | "message" | "sandbox_require_evidence" | "sandbox_adjudicate";
export type ActionInput = EvidenceInput & {
  type: ActionType; confirm: true; note?: string; offerAmount?: string;
  outcome?: "BUYER_FAVOR" | "SELLER_FAVOR"; attachments?: Attachment[];
};
export type Verdict = {
  score: number; recommendation: "FIGHT" | "OFFER" | "ACCEPT";
  missing: string[]; present: string[]; offerAmount: number;
  expectedRecovery: number; refundCost: number; daysLeft: number | null;
  urgent: boolean; explanation: string; supportedReason: boolean;
};
export type DocketRow = Dispute & { verdict: Verdict };
export type ApiEnvelope = {
  mode: "mock" | "sandbox"; trace: TraceEntry[]; error?: string;
  disputes?: DocketRow[]; dispute?: Dispute; verdict?: Verdict;
  brief?: { text: string; source: "template" | "nebius"; reason?: string };
  next?: string; warning?: string;
};

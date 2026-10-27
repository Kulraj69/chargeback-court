import type { Dispute, ActionType } from "./types";
export const ACTION_PATHS = {
  evidence: "provide-evidence", offer: "make-offer", accept: "accept-claim",
  message: "send-message", sandbox_require_evidence: "require-evidence", sandbox_adjudicate: "adjudicate",
} as const;
export function actionAvailable(dispute: Dispute, type: ActionType): boolean {
  if (dispute.status === "RESOLVED") return false;
  if (dispute.amountAvailable === false && (type === "accept" || type === "offer")) return false;
  if (dispute.availableActions) return dispute.availableActions.includes(ACTION_PATHS[type]);
  if (type === "evidence") return dispute.status === "WAITING_FOR_SELLER_RESPONSE";
  if (type.startsWith("sandbox_")) return dispute.status === "UNDER_REVIEW";
  if (type === "offer") return dispute.stage === "INQUIRY" && dispute.status !== "WAITING_FOR_BUYER_RESPONSE";
  return true;
}

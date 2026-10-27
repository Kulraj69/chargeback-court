import type { Dispute } from "@/lib/types";
// All people, identifiers, purchases and conversations below are invented.
// Dates are relative to a session's creation so the hosted demo stays useful.
export function syntheticDisputes(now = Date.now()): Dispute[] {
  const date = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const rows = [
    ["1001", "Elara Finch", "ITEM_NOT_RECEIVED", 128, 2, ["tracking", "delivery", "address"], "Lunar glaze dinner set", "My parcel hasn't arrived. Could you check the delivery?"],
    ["1002", "Milo Wren", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", 86, 1, ["listing", "messages"], "Cloudstone pour-over", "The glaze looks different from the listing photograph."],
    ["1003", "Juniper Vale", "UNAUTHORISED", 214, 6, ["delivery"], "Midnight serving collection", "I don't recognise this purchase on my account."],
    ["1004", "Orin Moss", "DUPLICATE_TRANSACTION", 42, 4, ["invoices", "fulfillment"], "Crescent espresso cups", "I see two charges and expected only one."],
    ["1005", "Thea Lark", "CREDIT_NOT_PROCESSED", 64, 3, ["refund", "refund_date"], "Starlight planter", "My refund hasn't appeared yet."],
    ["1006", "Silas Fern", "ITEM_NOT_RECEIVED", 12, 8, ["messages"], "Little moon spoon rest", "I haven't received the spoon rest."],
    ["1007", "Ada Brook", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", 175, -1, ["photos", "policy", "messages"], "Twilight tea service", "The handle arrived chipped."],
    ["1008", "Rowan Sable", "ITEM_NOT_RECEIVED", 98, 12, ["tracking", "delivery", "address", "messages"], "Nebula breakfast bowls", "Thank you, the delivery was located."],
  ] as const;
  return rows.map(([n, buyer, reason, value, days, evidence, item, message], index) => ({
    id: `MOCK-CASE-${n}`, reason, buyer, amount: { currency: "USD", value },
    status: index === 7 ? "RESOLVED" : index === 4 ? "UNDER_REVIEW" : "WAITING_FOR_SELLER_RESPONSE",
    stage: [1, 3, 5].includes(index) ? "INQUIRY" : "CHARGEBACK",
    due: index === 7 ? undefined : date(days), created: date(-7 - index), updated: date(-1),
    transactionId: `MOCK-TXN-${n}`, transactionAt: date(-14 - index),
    messages: [{ at: date(-7 - index), actor: "BUYER", text: message }],
    outcome: index === 7 ? "SELLER_FAVOR" : undefined, evidence: [...evidence],
    tracking: evidence.some(item => item === "tracking") ? { number: `MOCK-TRACK-${n}`, carrier: "MOCK-MOONPOST" } : undefined,
    transaction: { id: `MOCK-TXN-${n}`, at: date(-14 - index), amount: { currency: "USD", value }, status: "COMPLETED", item, payer: buyer, shippingAddress: `${20 + index} Fiction Lane, Moonhaven, CA 00000, US (synthetic)` },
  }));
}

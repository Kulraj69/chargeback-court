import { loadEnvConfig } from "@next/env";
import { PayPalClient, record, sandboxEnabled } from "../src/lib/paypal";
import type { TraceEntry } from "../src/lib/types";

// Creates a real sandbox purchase, not a manufactured dispute. Run capture only
// after a sandbox buyer has approved the printed sandbox checkout URL.
loadEnvConfig(process.cwd());
async function main() {
  const [command = "create", orderId] = process.argv.slice(2);
  if (!["create", "capture", "list"].includes(command)) throw new Error("Usage: npm run seed:sandbox -- create | capture ORDER_ID | list");
  if (!sandboxEnabled()) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to sandbox app credentials in .env.local first.");
  const client = new PayPalClient(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!);
  const trace: TraceEntry[] = [];
  if (command === "create") {
    const result = record(await client.request("/v2/checkout/orders", trace, JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ description: "Chargeback Court sandbox ceramics test purchase", amount: { currency_code: "USD", value: "48.00" } }],
      payment_source: { paypal: { experience_context: { brand_name: "Chargeback Court Sandbox", user_action: "PAY_NOW", return_url: "http://localhost:3000", cancel_url: "http://localhost:3000" } } },
    })));
    const links = Array.isArray(result.links) ? result.links.map(record) : [];
    const approval = links.find(l => l.rel === "payer-action" || l.rel === "approve");
    if (typeof result.id !== "string" || !/^[A-Z0-9-]{1,80}$/.test(result.id)) throw new Error("PayPal did not return a valid sandbox order ID.");
    if (typeof approval?.href !== "string" || new URL(approval.href).origin !== "https://www.sandbox.paypal.com") throw new Error("PayPal did not return a sandbox buyer approval link.");
    console.log(`Sandbox order created: ${result.id}\nApprove as a sandbox personal buyer: ${approval.href}\nAfter approval: npm run seed:sandbox -- capture ${result.id}`);
  } else if (command === "capture") {
    if (!orderId || !/^[A-Z0-9-]{1,80}$/.test(orderId)) throw new Error("Provide the approved sandbox order ID.");
    const result = record(await client.request(`/v2/checkout/orders/${orderId}/capture`, trace, "{}"));
    const units = Array.isArray(result.purchase_units) ? result.purchase_units.map(record) : [];
    const captures = units.flatMap(unit => { const items = record(unit.payments).captures; return Array.isArray(items) ? items.map(record) : []; });
    console.log(`Sandbox order status: ${String(result.status ?? "unknown")}`);
    for (const capture of captures) console.log(`Seller capture / transaction ID: ${String(capture.id ?? "not returned")}`);
    console.log("Now sign in as that sandbox buyer at https://www.sandbox.paypal.com, open the payment in Activity, and report a problem in the Resolution Center. This script does not fabricate or automatically create a dispute. Then run: npm run seed:sandbox -- list");
  } else {
    const result = await client.list(trace);
    for (const dispute of result.disputes) console.log(`${dispute.id} · ${dispute.reason} · ${dispute.status}`);
    if (!result.disputes.length) console.log("No sandbox disputes yet. A sandbox buyer must open a dispute on a completed payment.");
    if (result.next) console.log("More disputes are available; use the application's Load more cases control.");
  }
  for (const step of trace) console.log(`${step.method} ${step.path} · ${step.status} · ${step.ms}ms`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sandbox seeding failed."); process.exitCode = 1; });

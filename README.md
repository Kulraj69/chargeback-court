# Chargeback Court

**Small shop. Strong defence.** An AI paralegal for small PayPal sellers who need to respond to disputes without losing their evening to paperwork. Built for the PayPal AI Hackathon with Next.js 16, TypeScript, Tailwind CSS v4, AG Grid Community, and Nebius Nemotron.

Open the retro court docket, inspect a payment and its conversation, confirm the evidence you actually have, and get a transparent fight / partial refund / accept recommendation. Draft a short grounded note, attach supporting records, review the proposed action, and explicitly confirm before it is sent. A request trace makes the PayPal integration visible. Response deadlines export to an `.ics` calendar with a one-day reminder.

**Sandbox only. Not legal advice.** This is a functional test application. PayPal decides real dispute outcomes; a checklist score is neither a calibrated win probability nor a legal opinion.

## Run locally

Requires Node.js **20.19+** (Node 22 LTS recommended) and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Leave the environment values blank for the complete synthetic demo. No PayPal account or AI key is needed to try it.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm start
```

The Vercel configuration uses `npm install --include=dev` so TypeScript, Tailwind and build tools are installed. Set the project root to this directory. This repository does not provision a deployment or include sandbox credentials. All fonts are served locally from Fontsource; builds do not fetch Google Fonts.

Core framework versions and tooling follow the local Qloo project. Vitest is updated to 4.1.12+ because its earlier dependency tree had published security advisories. The UI adapts Qloo’s original CSS/SVG scenery and hardware treatment; reference screenshots are excluded from the repository and are not distributed as assets.

## Demo mode and connected sandbox mode

| Configuration | Behaviour |
| --- | --- |
| Either PayPal credential missing | **Demo mode: synthetic sandbox data**. Eight invented cases for the invented shop **Moonlit Ceramics**. Buyers, addresses, messages, orders, transaction IDs and tracking IDs are entirely synthetic; IDs begin with `MOCK-`. |
| Both PayPal credentials present | Real requests to the configured merchant’s **PayPal sandbox** account. No synthetic cases are mixed into the results. |
| Nebius key missing or output rejected | A deterministic brief assembled from the same confirmed facts. The UI identifies template output. |

The PayPal hostname is hard-coded to `https://api-m.sandbox.paypal.com`; there is no live URL setting or production mode. OAuth credentials and Nebius keys stay on the server. Tokens, authorization headers, payloads, query values, and upstream error bodies are never put in the trace. The trace records method, path, HTTP status, duration, timestamp, and whether the call was simulated.

**For judges on a hosted demo:** use the instance showing the synthetic demo badge. Open `MOCK-1001`, inspect the seeded evidence, draft the note, choose **File evidence**, review, and confirm. The case becomes **UNDER_REVIEW**. Open **Sandbox lifecycle controls → Adjudicate case**, choose seller or buyer favour, and confirm to reach **RESOLVED**. `MOCK-1002` demonstrates a partial refund offer awaiting the buyer. `MOCK-1006` demonstrates the low-value acceptance rule. No sign-in is needed for the synthetic demo.

Demo actions mutate an in-memory store keyed by a random HttpOnly, SameSite cookie. Assessment changes survive navigation within that store. Sessions expire after one day; the store holds at most 500 sessions. A restart, serverless cold start, eviction, or another serverless replica can reset demo state. Dates are relative to session creation so the docket continues to show varied deadlines. Demo attachments are validated, then discarded; their contents are not stored. Real sandbox attachments are sent to PayPal only on confirmed filing. Checklist selections in connected sandbox mode live in the open case view; refresh re-reads PayPal and requires confirmation again.

This sandbox demo has no merchant login or account onboarding. Every visitor to an instance with sandbox credentials can see and operate on that test merchant’s disputes. Use synthetic data on a public judging instance; use an isolated test merchant for a connected sandbox demonstration. Production merchant use would require authentication, merchant-scoped OAuth, durable storage, access controls and operational work beyond this sandbox application.

## Environment

| Name | Use |
| --- | --- |
| `PAYPAL_CLIENT_ID` | Client ID for a **sandbox** REST app belonging to your test seller. |
| `PAYPAL_CLIENT_SECRET` | That sandbox app’s secret. |
| `NEBIUS_API_KEY` | Optional Token Factory key for grounded brief drafting. |

Never prefix these names with `NEXT_PUBLIC_`. `.env*`, secret directories and key files are ignored; only the blank `.env.example` is tracked.

## PayPal APIs

All requests are REST calls. OAuth access tokens are cached in memory with an expiry safety margin; concurrent refreshes share one token request. Redirects are disabled, and pagination links are restricted to the sandbox disputes endpoint. Mutations are never automatically retried.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/v1/oauth2/token` | Client credentials OAuth using Basic authentication. |
| GET | `/v1/customer/disputes` | Paginated merchant docket (`page_size` and validated `next` links). |
| GET | `/v1/customer/disputes/{id}` | Reason, amount, buyer, linked transaction, deadlines, messages, lifecycle and permitted actions. |
| GET | `/v1/reporting/transactions` | Linked seller transaction using `transaction_id`, `start_date`, `end_date`, and `fields=all`. |
| POST | `/v1/customer/disputes/{id}/provide-evidence` | Multipart `input` JSON with evidence notes, confirmed tracking, and optional PDF/PNG/JPEG documents. |
| POST | `/v1/customer/disputes/{id}/make-offer` | `REFUND` offer with currency, amount and note. Buyer acceptance is still required. |
| POST | `/v1/customer/disputes/{id}/accept-claim` | Accept liability with a reviewed note. |
| POST | `/v1/customer/disputes/{id}/send-message` | Multipart `message` field sent to the other party. |
| POST | `/v1/customer/disputes/{id}/require-evidence` | Sandbox lifecycle: `action: SELLER_EVIDENCE`. |
| POST | `/v1/customer/disputes/{id}/adjudicate` | Sandbox lifecycle: `BUYER_FAVOR` or `SELLER_FAVOR`. |
| POST | `/v2/checkout/orders` | Seed script creates a sandbox purchase for buyer approval. |
| POST | `/v2/checkout/orders/{id}/capture` | Seed script captures an approved sandbox purchase. |

The Disputes API returns permitted actions in HATEOAS links; the connected UI and action route check these before filing. The mock follows comparable lifecycle rules. PayPal still validates account access, reason-specific evidence requirements and action eligibility; a schema-valid request can be rejected for the case’s current state. Tracking is sent as `PROOF_OF_FULFILLMENT`; notes without tracking are `OTHER`, so no refund ID or delivery signature is invented. Attachments use document names matching the multipart filenames. A case with missing optional fields remains readable. Missing or malformed dispute amounts are shown as unavailable and block refund actions instead of being treated as a real zero.

Transaction Search allows **at most 31 days per request**. The app searches around a known transaction date, or the 31 days preceding dispute creation if no purchase date is available. If the payment falls outside that window, use **Look up a different purchase window** in the case file. Missing permissions, lagging sandbox reporting (up to three hours), or absent records display a warning while leaving the case usable. The app does not scan unlimited historical windows.

References: [Disputes v1](https://developer.paypal.com/docs/api/customer-disputes/v1/), [Transaction Search](https://developer.paypal.com/docs/api/transaction-search/v1/), [Orders v2](https://developer.paypal.com/docs/api/orders/v2/), and [PayPal’s REST API specifications](https://github.com/paypal/paypal-rest-api-specifications).

## Create actual sandbox disputes

The seed script creates a **purchase**, not a fabricated dispute or a guaranteed API-created dispute. Sandbox access and available app capabilities depend on your PayPal developer account.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), create a sandbox **Business** seller and **Personal** buyer. Create a sandbox REST app for the seller. Enable **Disputes** in its app feature options and enable Transaction Search/reporting permissions where available.
2. Put that app’s sandbox ID and secret in `.env.local`. Restart the dev server after changing environment values.
3. Create an order:

   ```sh
   npm run seed:sandbox -- create
   ```

4. Open the printed **sandbox** approval URL in a browser. Sign in as the **sandbox personal buyer**, not your real PayPal account, and approve the purchase. The localhost return page does not capture automatically.
5. Capture the approved order using the returned ID:

   ```sh
   npm run seed:sandbox -- capture YOUR_SANDBOX_ORDER_ID
   ```

   The script prints the real sandbox seller capture/transaction ID. A capture that has not been approved will fail normally; the script does not bypass buyer approval.
6. Sign in as that sandbox buyer at <https://www.sandbox.paypal.com>. In **Activity**, open the completed payment, select **Report a problem**, and open a dispute in the sandbox **Resolution Center**. Follow the available reason and escalation steps. Wait for the sandbox record to become available.
7. Check the merchant’s disputes:

   ```sh
   npm run seed:sandbox -- list
   ```

   Refresh the application’s docket. It now displays the merchant’s real sandbox records. Use the test lifecycle controls only when PayPal returns the corresponding action link. `require-evidence` and adjudication normally require `UNDER_REVIEW`.

If your sandbox account does not expose dispute creation or the Disputes scope, check app features/account eligibility with PayPal. The script does not claim a dispute was created just because a payment succeeded. OAuth credentials alone are not enough to demonstrate a full dispute lifecycle: a sandbox buyer must actually open the case.

## Evidence scoring and AI

The deterministic engine in `src/lib/verdict.ts` owns the recommendation. Only checked evidence contributes; tracking also requires both a carrier and number.

| Reason | Evidence weights |
| --- | --- |
| Item not received | Tracking 25, delivery confirmation 35, matching address 25, buyer messages 15. |
| Not as described | Original listing 30, pre-shipment photos 35, disclosed return policy 20, messages 15. |
| Unauthorised | AVS/IP match records 35, prior orders 20, delivery confirmation 30, messages 15. |
| Duplicate transaction | Separate invoices 40, separate fulfillment 35, messages 25. |
| Credit not processed | Refund receipt 50, refund date confirmation 30, messages 20. |

- **FIGHT**: 65–100. **OFFER**: 35–64. **ACCEPT**: 0–34, or dispute amount **below USD 15** regardless of score. The time-cost threshold applies only to USD; there is no invented currency conversion.
- Suggested offer = `amount × clamp(1 − score/100, 0.25, 0.65)`, rounded to the currency’s minor unit. Offers must be positive and strictly below the disputed amount.
- Expected retention = `amount × score/100`, explicitly labelled **expected value (estimate)**. Refunding now costs the full dispute amount. This simple comparison excludes fees, effort, shipping and other costs; the score is a rough proxy, not observed probability.
- Response days use the ceiling of the remaining elapsed time in days. Three days or fewer, including overdue deadlines, is urgent. Exact local deadlines are also shown. Closed cases are not urgent.
- Unrecognised reasons require manual review, with no invented checklist.

Nebius is used solely to draft the note, through `https://api.tokenfactory.nebius.com/v1/chat/completions`, model **`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`**, with thinking disabled. The model gets a minimal facts JSON, not uploaded file contents, buyer addresses or the buyer’s conversation. It selects and orders exact grounded sentences. The guard rejects extra numbers, tracking IDs, dates, unconfirmed evidence, repeated sentences, altered factual claims, markup, and more than 120 words. Any missing key, timeout, invalid structure, provider failure or guard rejection uses a deterministic template. The source appears beneath the draft. The model never scores cases or invokes a PayPal action.

The seller can edit the final note in the confirmation dialog. Those human edits are not labelled AI-validated; review them against the records. Checkboxes are seller attestations, not automatic verification of attachment contents.

Brief requests are limited to **5 per IP per minute** and **300 per UTC day across all IPs in one process**, including template requests. The limiter follows the Qloo in-memory pattern. A hard deployment-wide cap on multiple Vercel replicas requires a durable shared counter (for example Redis); this repository does not claim an in-memory count coordinates separate processes. Vercel’s overwritten forwarding header is used there; a self-hosted proxy must overwrite `x-forwarded-for`.

Input validation enforces same-origin browser writes, JSON content type, a 3 MB request cap, known reason-specific evidence, 2,000-character notes, bounded IDs/tracking, money precision, and up to three 500 KB PDF/PNG/JPEG files with file-signature validation. Every action requires `confirm: true` as well as the UI review step. This is a demo workflow safeguard, not a replacement for merchant authentication.

## AG Grid and interface

The docket uses **`ag-grid-community` and `ag-grid-react` only** (MIT). It registers `AllCommunityModule` and customises `themeQuartz.withParams` for the green-on-navy CRT. Columns show case/buyer, reason, money, deadline, evidence strength, recommendation and status. Columns support sorting, filtering and resizing; quick search and reason chips narrow the view. Deadline, strength and verdict cells use custom renderers; row click or Enter opens the case. Pagination loads further PayPal pages without inventing records. No Enterprise row grouping, charts, server-side row model or license key is used.

The beige hardware enclosure, original CSS/SVG moonlit scenery, grain, scanlines, rubber-stamp transition and printed brief use self-hosted VT323 and IBM Plex Mono. The table scrolls horizontally on small screens; the surrounding UI reflows. Native dialogs trap focus and support Escape; reduced-motion, increased-contrast and forced-colour preferences are respected. Every consequential action has a review dialog.

## Internal API and tests

- `GET /api/disputes` — docket, optional `page_size` and `next`.
- `GET /api/disputes/[id]` — case and transaction; optional `start_date` / `end_date`.
- `POST /api/disputes/[id]/verdict` — `{ evidence: string[], tracking?: {carrier, number} }`.
- `POST /api/disputes/[id]/brief` — same confirmed evidence input.
- `POST /api/disputes/[id]/action` — `type`, `confirm: true`, evidence input, and the applicable `note`, `offerAmount`, `outcome`, or `attachments`.
- `GET /api/disputes/[id]/calendar` — calendar text inside the JSON response so the UI can record the trace before downloading the `.ics` file.

Responses include mode and trace, plus the requested result or a sanitised error. A successful PayPal write stays successful even if a subsequent status read fails; the UI requires refresh before another action.

Vitest covers reason-specific scores and thresholds, deadline/calendar math, offer rounding, OAuth cache/concurrency, sandbox-only requests and pagination, transaction query bounds, defensive parsing, multipart payloads, LLM fact guards/fallbacks, rate limits, session isolation, lifecycle transitions, validation, and the Next.js route handlers. PayPal and Nebius network requests in tests are mocked. Tests do not prove that any particular sandbox account has enabled the required API scopes; perform the purchase/dispute procedure above to validate a connected account.

MIT © 2026 Kulraj Singh. Dependencies retain their own licenses; AG Grid Community is MIT and Fontsource’s bundled fonts use their upstream open font licenses.

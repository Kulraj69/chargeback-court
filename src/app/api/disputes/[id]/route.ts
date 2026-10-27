import { api, getCase, type RouteParams } from "@/lib/api";
import { paypal } from "@/lib/paypal";
import { scoreCase } from "@/lib/verdict";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: RouteParams) {
  return api(request, async ctx => {
    const dispute = await getCase(ctx, (await params).id); let warning: string | undefined;
    if (ctx.mode === "sandbox" && dispute.transactionId) {
      const query = new URL(request.url).searchParams;
      const anchor = Date.parse(dispute.transactionAt ?? dispute.created ?? new Date().toISOString());
      const end = Math.min(Date.now(), dispute.transactionAt ? anchor + 86_400_000 : anchor);
      const start = dispute.transactionAt ? Math.max(0, anchor - 86_400_000) : end - 31 * 86_400_000;
      const startDate = query.get("start_date") ?? new Date(start).toISOString();
      const endDate = query.get("end_date") ?? new Date(end).toISOString();
      try {
        dispute.transaction = await paypal().transaction(dispute.transactionId, startDate, endDate, ctx.trace);
        if (!dispute.transaction) warning = "No transaction found in this 31-day window. Try the purchase dates below. Sandbox reporting can lag up to three hours.";
      } catch (error) {
        if (error instanceof AppError && error.status === 400) throw error;
        warning = "Transaction Search is unavailable. The dispute is still accessible; check reporting permissions or try again later.";
      }
    }
    return { dispute, verdict: scoreCase(dispute, dispute), warning };
  });
}

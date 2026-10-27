import { actionAvailable } from "@/lib/actions";
import { api, getCase, type RouteParams } from "@/lib/api";
import { readBody, validateAction } from "@/lib/validation";
import { paypal } from "@/lib/paypal";
import { mockStore, mockTrace } from "@/mock/store";
import { AppError } from "@/lib/errors";
import { scoreCase } from "@/lib/verdict";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: RouteParams) {
  return api(request, async ctx => {
    const body = await readBody(request); let dispute = await getCase(ctx, (await params).id);
    const action = validateAction(body, dispute);
    if (!actionAvailable(dispute, action.type)) throw new AppError("This action is not available in the current case state. Refresh the case.", 409);
    if (ctx.mode === "sandbox") {
      await paypal().action(dispute.id, action, dispute.amount.currency, ctx.trace);
      // A successful write must remain a success even if the subsequent read fails.
      try { dispute = await getCase(ctx, dispute.id); }
      catch { return { warning: "PayPal accepted the action. The status refresh failed; refresh the case before taking another action." }; }
    } else {
      dispute = mockStore.action(ctx.session, dispute.id, action); mockTrace(ctx.trace, "POST", dispute.id, action.type);
    }
    return { dispute, verdict: scoreCase(dispute, dispute) };
  });
}

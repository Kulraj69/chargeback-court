import { api, getCase, type RouteParams } from "@/lib/api";
import { readBody, validateEvidence } from "@/lib/validation";
import { scoreCase } from "@/lib/verdict";
import { mockStore } from "@/mock/store";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: RouteParams) {
  return api(request, async ctx => {
    const body = await readBody(request); const dispute = await getCase(ctx, (await params).id);
    const input = validateEvidence(body, dispute.reason);
    if (ctx.mode === "mock") mockStore.saveEvidence(ctx.session, dispute.id, input);
    return { verdict: scoreCase({ ...dispute, assessmentComplete: true }, input) };
  });
}

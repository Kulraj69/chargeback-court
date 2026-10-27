import { api, getCase, type RouteParams } from "@/lib/api";
import { readBody, validateEvidence } from "@/lib/validation";
import { draftBrief } from "@/lib/llm";
import { briefLimiter, clientIp } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: RouteParams) {
  return api(request, async ctx => {
    const body = await readBody(request); validateEvidence(body);
    const limit = briefLimiter.take(clientIp(request));
    if (!limit.ok) throw new AppError("Brief limit reached. Try again after the cooldown (5 per minute; 300 per day across this server).", 429, limit.retryAfter);
    const dispute = await getCase(ctx, (await params).id); const input = validateEvidence(body, dispute.reason);
    return { brief: await draftBrief(dispute, input, { apiKey: process.env.NEBIUS_API_KEY }) };
  });
}

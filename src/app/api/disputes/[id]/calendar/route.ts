import { api, getCase, type RouteParams } from "@/lib/api";
import { deadlineCalendar } from "@/lib/calendar";
export const runtime = "nodejs";
// The client downloads this text after receiving the trace in the JSON envelope.
export async function GET(request: Request, { params }: RouteParams) {
  return api(request, async ctx => ({ calendar: deadlineCalendar(await getCase(ctx, (await params).id)) }));
}

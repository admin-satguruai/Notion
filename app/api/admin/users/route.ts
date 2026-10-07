import { AuthError, requireAdmin } from "../../../../lib/auth/core";
import { body, failure, json, requireCsrf } from "../../../../lib/auth/http";
import { rpc, session, sessionToken } from "../../../../lib/auth/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = requireAdmin(await session(sessionToken(request)));
    const url = new URL(request.url);
    const page = Math.max(0, Math.min(100000, Number(url.searchParams.get("page")) || 0));
    return json(await rpc("list_users", { p_actor: actor.id, p_page: Math.floor(page) }));
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const token = sessionToken(request);
    requireCsrf(request, token);
    const actor = requireAdmin(await session(token));
    const input = await body(request);
    if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id) ||
      !["approve", "reject", "revoke"].includes(String(input.action))) throw new AuthError("invalid_request", 400);
    const user = await rpc("review", { p_actor: actor.id, p_user: input.id, p_action: input.action });
    return json({ user });
  } catch (error) { return failure(error); }
}

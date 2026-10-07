import { AuthError, configured, cookieName, csrf, digest, requireOrigin, secret, SESSION_SECONDS, verifyGoogle, type PortalUser } from "../../../../lib/auth/core";
import { body, failure, json, requireCsrf, setCookie } from "../../../../lib/auth/http";
import { readCookie, rpc, session, sessionToken } from "../../../../lib/auth/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, context: Context) {
  try {
    if ((await context.params).action !== "session") return json({ error: "not_found" }, 404);
    if (!configured()) return json({ user: null, error: "setup_required" }, 503);
    const raw = sessionToken(request);
    const user = await session(raw);
    return json({ user, csrf: user && raw ? csrf(raw) : null });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    if (!configured()) throw new AuthError("setup_required", 503);
    const { action } = await context.params;
    if (action === "challenge") {
      const raw = secret(), nonce = secret();
      await rpc("challenge", { p_hash: digest(raw), p_nonce: nonce });
      const response = json({ nonce, csrf: csrf(raw), clientId: process.env.GOOGLE_CLIENT_ID });
      setCookie(response, "challenge", raw, 600);
      return response;
    }
    if (action === "google") {
      const raw = readCookie(request.headers.get("cookie"), cookieName("challenge"));
      requireCsrf(request, raw);
      const input = await body(request);
      const nonce = await rpc<string | null>("nonce", { p_hash: digest(raw!) });
      if (!nonce) throw new AuthError("invalid_challenge");
      const identity = await verifyGoogle(input.credential, nonce, process.env.GOOGLE_CLIENT_ID!);
      const token = secret();
      const previous = sessionToken(request);
      const user = await rpc<PortalUser>("login", { p_challenge_hash: digest(raw!), p_nonce: nonce,
        p_sub: identity.sub, p_email: identity.email, p_name: identity.name,
        p_session_hash: digest(token), p_previous_hash: previous ? digest(previous) : null });
      const response = json({ redirect: user.status === "approved" ? "/" : "/access-pending" });
      setCookie(response, "session", token, SESSION_SECONDS);
      setCookie(response, "challenge", "", 0);
      return response;
    }
    if (action === "logout") {
      const raw = sessionToken(request);
      requireCsrf(request, raw);
      await rpc("logout", { p_hash: digest(raw!) });
      const response = json({ redirect: "/login" });
      setCookie(response, "session", "", 0);
      setCookie(response, "challenge", "", 0);
      return response;
    }
    return json({ error: "not_found" }, 404);
  } catch (error) { return failure(error); }
}

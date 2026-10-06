import { AuthError, configured, cookieName, digest, type PortalUser } from "./core";
// SERVER ONLY: never import this module into a client component.
export async function rpc<T>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!configured()) throw new AuthError("setup_required", 503);
  const key = process.env.SUPABASE_SECRET_KEY!;
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
  // Modern secret keys go in apikey; legacy service-role JWTs also use Authorization.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/rpc/notion_portal_${fn}`, {
      method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
  } catch { throw new AuthError("storage_unavailable", 503); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const known: Record<string, number> = {
      invalid_challenge: 401, identity_conflict: 409, invalid_transition: 409, admin_required: 403, protected_admin: 403,
    };
    if (error && Object.hasOwn(known, error.message)) throw new AuthError(error.message, known[error.message]);
    throw new AuthError("storage_unavailable", 503);
  }
  return response.json() as Promise<T>;
}
export function readCookie(header: string | null, name: string): string | undefined {
  return header?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function sessionToken(request: Request) {
  return readCookie(request.headers.get("cookie"), cookieName("session"));
}
export async function session(raw?: string): Promise<PortalUser | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return rpc<PortalUser | null>("session", { p_hash: digest(raw) });
}

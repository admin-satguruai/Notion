import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

export const DOMAIN = "satgurutravel.com";
export const FIRST_ADMIN = "avinash.damale@satgurutravel.com";
export const SESSION_SECONDS = 8 * 60 * 60;
export type PortalUser = {
  id: string; email: string; name: string;
  role: "super_admin" | "user";
  status: "pending" | "approved" | "rejected" | "revoked";
  requested_at: string; reviewed_at: string | null;
};
export class AuthError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}
export const secret = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const csrf = (value: string) => digest(`notion-portal-csrf:${value}`);
export function equal(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length > 1024 || b.length > 1024) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function origin(): string {
  const value = process.env.PORTAL_ORIGIN ||
    (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error();
    return url.origin;
  } catch { throw new AuthError("setup_required", 503); }
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== origin()) throw new AuthError("invalid_origin", 403);
}
export function configured(): boolean {
  try {
    origin();
    return !!process.env.GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com") &&
      !!process.env.SUPABASE_SECRET_KEY && new URL(process.env.SUPABASE_URL || "").protocol === "https:";
  } catch { return false; }
}
export function cookieName(kind: "session" | "challenge") {
  return `${origin().startsWith("https:") ? "__Host-" : ""}notion-${kind}`;
}
export function requireApproved(user: PortalUser | null): PortalUser {
  if (!user) throw new AuthError("sign_in_required", 401);
  if (user.status !== "approved") throw new AuthError("approval_required", 403);
  return user;
}
export function requireAdmin(user: PortalUser | null): PortalUser {
  const approved = requireApproved(user);
  if (approved.role !== "super_admin" || approved.email !== FIRST_ADMIN) throw new AuthError("admin_required", 403);
  return approved;
}
export type GoogleIdentity = { sub: string; email: string; name: string };
type Jwk = { kid: string; kty?: string; alg?: string; use?: string; n?: string; e?: string };
let cached: { keys: Jwk[]; expires: number; fetched: number } | undefined;
let loading: Promise<Jwk[]> | undefined;
async function googleKeys(kid: string): Promise<Jwk[]> {
  const now = Date.now();
  if (cached && now < cached.expires && (cached.keys.some(k => k.kid === kid) || now - cached.fetched < 60000)) return cached.keys;
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new AuthError("google_unavailable", 503);
    const text = await response.text();
    if (text.length > 100000) throw new AuthError("google_unavailable", 503);
    const body = JSON.parse(text);
    if (!Array.isArray(body.keys)) throw new AuthError("google_unavailable", 503);
    const keys = body.keys.filter((k: Jwk) => k && k.kty === "RSA" && k.kid &&
      (!k.use || k.use === "sig") && (!k.alg || k.alg === "RS256"));
    const ttl = Math.max(0, Math.min(Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 300), 3600));
    cached = { keys, expires: Date.now() + ttl * 1000, fetched: Date.now() };
    return keys;
  })();
  try { return await loading; }
  catch { throw new AuthError("google_unavailable", 503); }
  finally { loading = undefined; }
}
// Fixed issuer/key endpoint, RS256 only. Never trust JWT-supplied key URLs.
// Optional keys/time arguments support offline tests; HTTP handlers never expose them.
export async function verifyGoogle(token: unknown, nonce: string, clientId: string,
  keys?: Jwk[], now = Math.floor(Date.now() / 1000)): Promise<GoogleIdentity> {
  if (typeof token !== "string" || token.length > 16384 || !clientId || !nonce) throw new AuthError("invalid_google_token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new AuthError("invalid_google_token");
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { throw new AuthError("invalid_google_token"); }
  if (!header || !claims || Array.isArray(header) || Array.isArray(claims) || header.alg !== "RS256" ||
      typeof header.kid !== "string" || header.kid.length > 256 || header.crit !== undefined || header.b64 === false)
    throw new AuthError("invalid_google_token");
  const key = (keys || await googleKeys(header.kid)).find(k => k.kid === header.kid && k.kty === "RSA" &&
    (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  if (!key) throw new AuthError("invalid_google_token");
  try {
    if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"))) throw new Error();
  } catch { throw new AuthError("invalid_google_token"); }
  if (!["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) || claims.aud !== clientId ||
    (claims.azp !== undefined && claims.azp !== clientId) || typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) || claims.exp <= now || typeof claims.iat !== "number" ||
    !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.exp <= claims.iat ||
    (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now + 60)) ||
    !equal(claims.nonce, nonce) || typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub))
    throw new AuthError("invalid_google_token");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (claims.email_verified !== true || typeof claims.hd !== "string" || claims.hd.toLowerCase() !== DOMAIN ||
    !/^[^\s@]+@satgurutravel\.com$/.test(email)) throw new AuthError("company_account_required", 403);
  return { sub: claims.sub, email, name: typeof claims.name === "string" ? claims.name.slice(0, 150) : email };
}

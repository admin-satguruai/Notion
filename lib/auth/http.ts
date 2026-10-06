import { NextResponse } from "next/server";
import { AuthError, cookieName, csrf, equal, origin, requireOrigin } from "./core";
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  } });
}
export function failure(error: unknown) {
  return json({ error: error instanceof AuthError ? error.code : "service_unavailable" },
    error instanceof AuthError ? error.status : 503);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthError("invalid_request", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("invalid_request", 400);
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 20000) { await reader.cancel(); throw new AuthError("request_too_large", 413); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AuthError("invalid_request", 400); }
}
export function setCookie(response: NextResponse, kind: "session" | "challenge", value: string, maxAge: number) {
  response.cookies.set(cookieName(kind), value, {
    httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax", path: "/", maxAge,
  });
}
export function requireCsrf(request: Request, token?: string) {
  requireOrigin(request);
  if (!token || !equal(request.headers.get("x-portal-csrf"), csrf(token))) throw new AuthError("invalid_csrf", 403);
}

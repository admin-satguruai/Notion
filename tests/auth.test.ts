import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { AuthError, csrf, digest, equal, FIRST_ADMIN, requireAdmin, requireApproved, requireOrigin, secret, verifyGoogle, type PortalUser } from "../lib/auth/core";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" };
const now = 1800000000;
const claims = { iss: "https://accounts.google.com", aud: "test.apps.googleusercontent.com", sub: "123456789", exp: now + 3600, iat: now, nonce: "test-nonce", email: "employee@satgurutravel.com", email_verified: true, hd: "satgurutravel.com", name: "Employee" };
function token(changes: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const data = [{ alg: "RS256", kid: "test-key", ...header }, { ...claims, ...changes }].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
const check = (value: unknown) => verifyGoogle(value, claims.nonce, claims.aud, [key], now);
test("accepts a signed verified company identity", async () => assert.equal((await check(token())).email, claims.email));
test("normalizes email case", async () => assert.equal((await check(token({ email: "EMPLOYEE@SATGURUTRAVEL.COM" }))).email, claims.email));
test("accepts Google's alternate issuer", async () => assert.equal((await check(token({ iss: "accounts.google.com" }))).sub, claims.sub));
for (const [label, changes] of Object.entries({
  "Gmail": { email: "employee@gmail.com", hd: "gmail.com" },
  "lookalike suffix": { email: "employee@satgurutravel.com.evil.example" },
  "lookalike prefix": { email: "employee@evil-satgurutravel.com" },
  "unverified email": { email_verified: false },
  "string instead of boolean verification": { email_verified: "true" },
  "missing hosted domain": { hd: null },
  "wrong hosted domain": { hd: "other.example" },
  "expired token": { exp: now },
  "future issue time": { iat: now + 120 },
  "future not before": { nbf: now + 120 },
  "wrong audience": { aud: "attacker-client" },
  "wrong authorized party": { azp: "attacker-client" },
  "wrong issuer": { iss: "https://evil.example" },
  "wrong nonce": { nonce: "other-nonce" },
  "missing subject": { sub: "" },
  "multiple at signs": { email: "employee@evil@satgurutravel.com" },
  "missing email": { email: null },
})) test(`rejects ${label}`, async () => { await assert.rejects(check(token(changes)), AuthError); });
test("rejects an algorithm switch", async () => { await assert.rejects(check(token({}, { alg: "HS256" })), AuthError); });
test("rejects an unknown signing key", async () => { await assert.rejects(check(token({}, { kid: "untrusted" })), AuthError); });
test("rejects unsupported critical headers", async () => { await assert.rejects(check(token({}, { crit: ["custom"] })), AuthError); });
test("rejects tampered signed claims", async () => {
  const parts = token().split("."); parts[1] = Buffer.from(JSON.stringify({ ...claims, email: FIRST_ADMIN })).toString("base64url");
  await assert.rejects(check(parts.join(".")), AuthError);
});
for (const value of [undefined, null, 123, "", "a.b.c", "bad", "x".repeat(20000)]) test(`rejects malformed token ${String(value).slice(0,15)}`, async () => { await assert.rejects(check(value), AuthError); });
const user: PortalUser = { id: "id", email: claims.email, name: "Employee", role: "user", status: "approved", requested_at: "", reviewed_at: null };
test("approved users can pass the portal gate", () => assert.equal(requireApproved(user), user));
for (const status of ["pending", "rejected", "revoked"] as const) test(`${status} users cannot pass the portal gate`, () => assert.throws(() => requireApproved({ ...user, status }), AuthError));
test("anonymous users cannot pass the portal gate", () => assert.throws(() => requireApproved(null), AuthError));
test("ordinary users cannot approve users", () => assert.throws(() => requireAdmin(user), AuthError));
test("only the designated administrator passes the admin gate", () => assert.equal(requireAdmin({ ...user, role: "super_admin", email: FIRST_ADMIN }).email, FIRST_ADMIN));
test("a different email cannot be the first admin", () => assert.throws(() => requireAdmin({ ...user, role: "super_admin" }), AuthError));
test("tokens are random, opaque, and hashed for storage", () => {
  const a = secret(); assert.equal(a.length, 43); assert.notEqual(a, secret()); assert.equal(digest(a).length, 64); assert.notEqual(csrf(a), digest(a));
});
test("constant-time comparison rejects missing and unequal values", () => { assert.ok(equal("abc", "abc")); assert.ok(!equal("", "")); assert.ok(!equal("abc", "abcd")); assert.ok(!equal(null, "abc")); });
test("mutations require the configured exact origin", () => {
  const old = process.env.PORTAL_ORIGIN; process.env.PORTAL_ORIGIN = "https://portal.example.com";
  try {
    requireOrigin(new Request("https://portal.example.com/api", { headers: { origin: "https://portal.example.com" } }));
    assert.throws(() => requireOrigin(new Request("https://portal.example.com/api", { headers: { origin: "https://evil.example" } })), AuthError);
    assert.throws(() => requireOrigin(new Request("https://portal.example.com/api")), AuthError);
  } finally { if (old === undefined) delete process.env.PORTAL_ORIGIN; else process.env.PORTAL_ORIGIN = old; }
});

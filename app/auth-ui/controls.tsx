"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PortalUser } from "../../lib/auth/core";
import styles from "./auth.module.css";
type GoogleApi = { accounts: { id: {
  initialize: (options: { client_id: string; callback: (value: { credential: string }) => void; nonce: string; hd: string; auto_select: boolean }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
} } };
declare global { interface Window { google?: GoogleApi } }
const messages: Record<string, string> = {
  company_account_required: "Please use a verified @satgurutravel.com Google Workspace account.",
  invalid_google_token: "Google sign-in could not be verified. Please try again.",
  invalid_challenge: "This sign-in attempt expired or was already used. Please try again.",
  identity_conflict: "This email is linked to a different Google identity. Contact the administrator.",
  setup_required: "Sign-in configuration is incomplete. Contact the administrator.",
  storage_unavailable: "Account storage is unavailable. Please try again later.",
  invalid_transition: "The account was changed by another request. Refresh and try again.",
  admin_required: "Administrator access is required.",
  approval_required: "Your account is not approved for portal access.",
  invalid_csrf: "The session changed. Refresh this page and try again.",
};
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(messages[result.error] || "The request could not be completed. Please try again.");
  return result;
}
async function mutate(path: string, method: string, payload?: object) {
  const auth = await request("/api/auth/session");
  if (!auth.user || !auth.csrf) {
    window.location.replace("/login"); throw new Error("Please sign in again.");
  }
  return request(path, { method, headers: { "Content-Type": "application/json", "X-Portal-CSRF": auth.csrf }, body: JSON.stringify(payload || {}) });
}
export function GoogleLogin() {
  const holder = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = useCallback(async () => {
    if (!window.google || !holder.current || active.current) return;
    active.current = true; setError("");
    try {
      const challenge = await request("/api/auth/challenge", { method: "POST" });
      window.google.accounts.id.initialize({
        client_id: challenge.clientId, nonce: challenge.nonce, hd: "satgurutravel.com", auto_select: false,
        callback: async ({ credential }) => {
          if (submitting.current) return;
          submitting.current = true; setBusy(true); setError("");
          try {
            const result = await request("/api/auth/google", { method: "POST", headers: {
              "Content-Type": "application/json", "X-Portal-CSRF": challenge.csrf,
            }, body: JSON.stringify({ credential }) });
            window.location.replace(result.redirect === "/" ? "/" : "/access-pending");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed.");
            setBusy(false); active.current = false; submitting.current = false;
          }
        },
      });
      if (!holder.current) return;
      holder.current.innerHTML = "";
      window.google.accounts.id.renderButton(holder.current, {
        type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
      });
    } catch (e) { active.current = false; setError(e instanceof Error ? e.message : "Google is unavailable."); }
  }, []);
  return <>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => { void setup(); }}
      onError={() => setError("Google sign-in could not load. Check your network or browser settings.")} />
    <div className={styles.google} ref={holder} style={{ pointerEvents: busy ? "none" : "auto" }} aria-busy={busy} />
    {busy && <p role="status">Verifying your account...</p>}
    {error && <div role="alert"><p className={styles.error}>{error}</p><button className={styles.button}
      onClick={() => { active.current = false; void setup(); }}>Retry sign-in</button></div>}
  </>;
}
export function AccountBar({ user }: { user: PortalUser }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true); setError("");
    try {
      await mutate("/api/auth/logout", "POST");
      window.google?.accounts.id.disableAutoSelect(); window.location.replace("/login");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign out failed."); setBusy(false); }
  };
  useEffect(() => {
    const check = () => { void request("/api/auth/session").then(({ user: current }) => {
      if (!current) window.location.replace("/login");
      else if (current.status !== "approved" && window.location.pathname !== "/access-pending")
        window.location.replace("/access-pending");
    }).catch(() => {}); };
    const timer = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    return () => { clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
  return <div className={styles.bar}><div><span>{user.email}</span><span className={styles.badge}>
    {user.role === "super_admin" ? "Super Admin" : user.status === "approved" ? "Approved user" : user.status}
  </span></div><div>
    {user.status === "approved" && <a href="/">Dashboard</a>}
    {user.status === "approved" && user.role === "super_admin" && <a href="/admin/users">User Approvals</a>}
    <button className={styles.button} onClick={logout} disabled={busy}>{busy ? "Signing out..." : "Sign out"}</button>
    {error && <span className={styles.error} role="alert">{error}</span>}
  </div></div>;
}
export function AccessStatus() {
  const [message, setMessage] = useState("");
  const check = useCallback(async () => {
    try {
      const { user } = await request("/api/auth/session");
      if (!user) window.location.replace("/login");
      else if (user.status === "approved") window.location.replace("/");
      else setMessage(user.status === "pending" ? "Your request is still awaiting approval." : `Current status: ${user.status}. Please contact the administrator.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Status check failed."); }
  }, []);
  useEffect(() => { const timer = window.setInterval(() => void check(), 30000); return () => clearInterval(timer); }, [check]);
  return <><button className={`${styles.button} ${styles.primary}`} onClick={() => void check()}>Check approval status</button>
    <p className={styles.status} role="status">{message}</p></>;
}
export function UserApprovals() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [total, setTotal] = useState(0), [pending, setPending] = useState(0), [page, setPage] = useState(0);
  const [busy, setBusy] = useState(""), [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError("");
    try {
      const result = await request(`/api/admin/users?page=${page}`);
      if (current === sequence.current) { setUsers(result.users); setTotal(result.total); setPending(result.pending); }
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : "Unable to load users."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const review = async (user: PortalUser, action: string) => {
    if (!window.confirm(`${action === "approve" ? "Approve access for" : action === "reject" ? "Reject the request from" : "Revoke access for"} ${user.email}?`)) return;
    setBusy(user.id); setError(""); setMessage("");
    try {
      await mutate("/api/admin/users", "PATCH", { id: user.id, action });
      setMessage(`Access updated for ${user.email}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed."); }
    finally { setBusy(""); }
  };
  return <><div className={styles.actions}>
    <span className={styles.badge}>{pending} pending requests</span><span className={styles.badge}>{total} users</span>
    <button className={styles.button} disabled={loading || !!busy} onClick={() => void load()}>Refresh</button>
  </div>{error && <p className={styles.error} role="alert">{error}</p>}
  <p className={styles.status} role="status">{loading ? "Loading approval queue..." : message}</p>
  <div className={styles.table}><table><thead><tr><th>User</th><th>Email</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead>
    <tbody>{users.map(user => <tr key={user.id}>
      <td>{user.name}<br /><small>{user.role === "super_admin" ? "Super Admin" : "User"}</small></td>
      <td>{user.email}</td><td>{user.status}</td><td>{new Date(user.requested_at).toLocaleString()}</td>
      <td>{user.role === "super_admin" ? "First administrator - protected" : <div className={styles.actions}>
        {user.status !== "approved" && <button disabled={!!busy || loading} className={`${styles.button} ${styles.primary}`} onClick={() => void review(user, "approve")}>Approve</button>}
        {user.status === "pending" && <button disabled={!!busy || loading} className={`${styles.button} ${styles.danger}`} onClick={() => void review(user, "reject")}>Reject</button>}
        {user.status === "approved" && <button disabled={!!busy || loading} className={`${styles.button} ${styles.danger}`} onClick={() => void review(user, "revoke")}>Revoke</button>}
      </div>}</td>
    </tr>)}</tbody></table>
    {!loading && !users.length && <p className={styles.notice}>No users to display.</p>}
  </div><div className={styles.pagination}>
    <button className={styles.button} disabled={page === 0 || loading || !!busy} onClick={() => setPage(p => p - 1)}>Previous</button>
    <span>Page {page + 1}</span>
    <button className={styles.button} disabled={(page + 1) * 50 >= total || loading || !!busy} onClick={() => setPage(p => p + 1)}>Next</button>
  </div></>;
}

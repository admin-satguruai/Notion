import { redirect } from "next/navigation";
import { configured, DOMAIN } from "../../lib/auth/core";
import { pageUser } from "../../lib/auth/page";
import { GoogleLogin } from "../auth-ui/controls";
import styles from "../auth-ui/auth.module.css";
export const dynamic = "force-dynamic";
export default async function Login() {
  const user = await pageUser();
  if (user) redirect(user.status === "approved" ? "/" : "/access-pending");
  return <div className={styles.screen}><div className={styles.card}>
    <div className={styles.mark}>W</div><p className={styles.eyebrow}>SATGURU TRAVEL</p>
    <h1>My Work</h1><p className={styles.subtitle}>Sign in to your Performance Hub</p>
    <p>Use your company Google account ending in <strong>@{DOMAIN}</strong>.</p>
    {configured() ? <GoogleLogin /> : <p className={styles.notice} role="status">Google sign-in setup is pending. Please contact the portal administrator.</p>}
    <div className={styles.notice}>New here? Your first sign-in submits an access request. The portal remains locked until the administrator approves it.</div>
    <p className={styles.small}>No separate password or signup form is required.</p>
  </div></div>;
}

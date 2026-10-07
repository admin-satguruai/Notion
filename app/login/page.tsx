import { redirect } from "next/navigation";
import { configured, DOMAIN } from "../../lib/auth/core";
import { pageUser } from "../../lib/auth/page";
import { GoogleLogin } from "../auth-ui/controls";
import styles from "../auth-ui/auth.module.css";

export const dynamic = "force-dynamic";

export default async function Login() {
  const user = await pageUser();
  if (user) redirect(user.status === "approved" ? "/" : "/access-pending");

  return (
    <main className={styles.loginScreen}>
      <section className={styles.loginCard}>
        <div className={styles.loginBrand}>SATGURU TRAVEL</div>
        <h1>My Work</h1>
        <p className={styles.loginSubtitle}>Sign in with your company Google account</p>

        {configured() ? (
          <GoogleLogin />
        ) : (
          <p className={styles.notice} role="status">
            Google sign-in setup is pending. Please contact the portal administrator.
          </p>
        )}

        <p className={styles.loginNote}>
          Only <strong>@{DOMAIN}</strong> accounts are allowed. New users require administrator approval.
        </p>
      </section>
    </main>
  );
}

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
    <main className={styles.enterpriseLogin}>
      <section className={styles.brandPanel} aria-label="Satguru Travel portal">
        <div className={styles.brandPanelInner}>
          <div className={styles.companyLockup}>
            <div className={styles.companyMark}>ST</div>
            <div>
              <div className={styles.companyName}>SATGURU TRAVEL</div>
              <div className={styles.companyDescriptor}>Internal Workspace</div>
            </div>
          </div>
          <div className={styles.brandMessage}>
            <span className={styles.portalLabel}>MY WORK</span>
            <h1>One secure workspace for your work and performance.</h1>
            <p>Access assigned work, performance insights, and team activity through your Satguru Travel company account.</p>
          </div>
          <div className={styles.brandSecurity}>
            <span className={styles.securityBadge}>SECURE</span>
            <div><strong>Protected company access</strong><span>Restricted to authorized Satguru Travel users.</span></div>
          </div>
        </div>
      </section>
      <section className={styles.signInPanel}>
        <div className={styles.signInCard}>
          <div className={styles.mobileBrand}>
            <div className={styles.companyMark}>ST</div>
            <div><div className={styles.companyName}>SATGURU TRAVEL</div><div className={styles.companyDescriptor}>Internal Workspace</div></div>
          </div>
          <div className={styles.signInHeader}>
            <span className={styles.welcomeLabel}>WELCOME BACK</span>
            <h2>Sign in to My Work</h2>
            <p>Continue with your Satguru Travel Google Workspace account.</p>
          </div>
          {configured() ? <GoogleLogin /> : <p className={styles.notice} role="status">Google sign-in setup is pending. Please contact the portal administrator.</p>}
          <div className={styles.accessRule}>
            <span className={styles.accessDot} aria-hidden="true" />
            <p>Only verified <strong>@{DOMAIN}</strong> accounts can sign in. First-time users require administrator approval before portal access is enabled.</p>
          </div>
          <p className={styles.signInFooter}>Satguru Travel - Authorized access only</p>
        </div>
      </section>
    </main>
  );
}

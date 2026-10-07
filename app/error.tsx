"use client";
import styles from "./auth-ui/auth.module.css";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className={styles.screen}><div className={styles.card}>
    <h1>Unable to load the portal</h1>
    <p>The service is temporarily unavailable. No additional access has been granted.</p>
    <button className={styles.button} onClick={reset}>Try again</button>
    <p><a href="/login">Return to sign-in</a></p>
  </div></div>;
}

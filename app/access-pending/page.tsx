import { redirect } from "next/navigation";
import { FIRST_ADMIN } from "../../lib/auth/core";
import { pageUser } from "../../lib/auth/page";
import { AccountBar, AccessStatus } from "../auth-ui/controls";
import styles from "../auth-ui/auth.module.css";
export const dynamic = "force-dynamic";
export default async function Pending() {
  const user = await pageUser();
  if (!user) redirect("/login");
  if (user.status === "approved") redirect("/");
  return <><AccountBar user={user} /><div className={styles.screen}><div className={styles.card}>
    <p className={styles.eyebrow}>ACCOUNT ACCESS</p>
    <h1>{user.status === "pending" ? "Awaiting approval" : user.status === "rejected" ? "Request not approved" : "Access revoked"}</h1>
    <p><strong>{user.email}</strong></p>
    <p>{user.status === "pending" ? "Your request is in the administrator's approval queue. No portal data is available until approval." : "Please contact the administrator to review your access. Signing in again will not reset this decision."}</p>
    <p className={styles.small}>Administrator: {FIRST_ADMIN}</p><AccessStatus />
  </div></div></>;
}

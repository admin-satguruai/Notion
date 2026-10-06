import { redirect } from "next/navigation";
import { FIRST_ADMIN } from "../../../lib/auth/core";
import { pageUser } from "../../../lib/auth/page";
import { AccountBar, UserApprovals } from "../../auth-ui/controls";
import styles from "../../auth-ui/auth.module.css";
export const dynamic = "force-dynamic";
export default async function AdminUsers() {
  const user = await pageUser();
  if (!user) redirect("/login");
  if (user.status !== "approved") redirect("/access-pending");
  if (user.role !== "super_admin" || user.email !== FIRST_ADMIN) redirect("/");
  return <><AccountBar user={user} /><div className={styles.admin}>
    <p className={styles.eyebrow}>PORTAL ADMINISTRATION</p><h1>User Approvals</h1>
    <p>Review access requests from Satguru Travel employees. Approvals and access revocations are recorded in the audit log.</p>
    <UserApprovals />
  </div></>;
}

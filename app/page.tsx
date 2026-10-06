import { redirect } from "next/navigation";
import PerformanceDashboard from "./PerformanceDashboard";
import { pageUser } from "../lib/auth/page";
import { AccountBar } from "./auth-ui/controls";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await pageUser();
  if (!user) redirect("/login");
  if (user.status !== "approved") redirect("/access-pending");
  return <><AccountBar user={user} /><PerformanceDashboard /></>;
}

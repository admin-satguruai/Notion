import { cookies } from "next/headers";
import { cookieName, configured } from "./core";
import { session } from "./store";
export async function pageUser() {
  if (!configured()) return null;
  return session((await cookies()).get(cookieName("session"))?.value);
}

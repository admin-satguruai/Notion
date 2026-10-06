import { getTasks } from "../../../lib/notion";
import { demoTasks } from "../../../lib/demo";
import { AuthError, requireApproved } from "../../../lib/auth/core";
import { json } from "../../../lib/auth/http";
import { session, sessionToken } from "../../../lib/auth/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // Authorization must remain OUTSIDE the demo-data fallback.
  try { requireApproved(await session(sessionToken(request))); }
  catch (error) {
    // Keep the legacy dashboard's array shape safe on session expiry without
    // returning real or demonstration tasks to unauthenticated/pending users.
    return json({ tasks: [], source: "unavailable", error: error instanceof AuthError ? error.code : "service_unavailable" },
      error instanceof AuthError ? error.status : 503);
  }
  try {
    const tasks = await getTasks();
    return json({ tasks: tasks.length ? tasks : demoTasks, source: tasks.length ? "notion" : "demo", syncedAt: new Date().toISOString() });
  } catch {
    return json({ tasks: demoTasks, source: "demo", warning: "Notion is unavailable. Showing demonstration data.", syncedAt: new Date().toISOString() });
  }
}

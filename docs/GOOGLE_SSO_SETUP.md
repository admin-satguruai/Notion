# Google SSO and administrator approval

## Scope

This change targets admin-satguruai/Notion, not admin-satguruai/Test. The original dashboard is preserved as app/PerformanceDashboard.tsx behind a server-side gate. No production credentials are committed.

- Continue with Google handles signup and returning sign-in.
- Google-signed identity, verified email and hosted-domain claims must match satgurutravel.com.
- New employees enter pending status. No dashboard or task API access before approval.
- The database setup reserves avinash.damale@satgurutravel.com as the first approved super_admin. Actual Google authentication is required to bind this reservation to the account.
- Only that administrator can approve, reject and revoke users at /admin/users.
- Repeated sign-in does not duplicate users or reset rejection/revocation. Decisions are audited and revocation removes sessions.
- Requests appear in the portal approval queue; email notifications are not included.
- Approved users retain the existing dashboard's task visibility. Per-person task authorization is not introduced by this change.

## Activation prerequisites

Keep the branch/preview separate from production until these are complete. Missing configuration fails closed; it does not expose demo data to unauthenticated users.

1. Select an approved active Supabase database. Run database/portal-auth.sql, then database/verify-portal-auth.sql. The latter rolls back its test data. Run security advisors. Verify anon/authenticated cannot use the account tables or RPCs. This implementation uses Supabase as a server-side database, not Supabase Auth.
2. Create a Google Auth Platform Web application client. Register the exact production and stable UAT URLs under Authorized JavaScript origins. This GIS callback implementation needs the client ID, not a client secret or /api/auth/callback/google redirect URI. An Internal audience is appropriate only for an eligible company Workspace project.
3. Configure the Vercel notion project separately for preview and production:

| Variable | Purpose |
| --- | --- |
| GOOGLE_CLIENT_ID | Registered Google Web client ID ending in .apps.googleusercontent.com |
| PORTAL_ORIGIN | Exact HTTPS origin without a path, query or fragment |
| SUPABASE_URL | Selected active project's HTTPS API URL |
| SUPABASE_SECRET_KEY | Server-only secret key or legacy service-role JWT |
| NOTION_TOKEN | Existing Notion integration token for real task data |
| NOTION_DATA_SOURCE_ID | Existing task data source ID |

Never put a secret into NEXT_PUBLIC_ variables, source control, screenshots or chat. Preview can derive its origin from VERCEL_URL, but Google must still have that precise origin registered. Production requires PORTAL_ORIGIN.

4. Redeploy the preview and complete the checks below. Merge/promote only after real Google login and database tests succeed. Vercel deployment protection is separate from app SSO: keep unconfigured previews protected and configure the intended employee-facing domain before rollout.

## Security design

Opaque 256-bit random sessions expire after eight hours; only token hashes are stored. HTTPS uses HttpOnly, Secure, SameSite=Lax, __Host- cookies. Ten-minute login challenges are consumed transactionally, with Origin and cookie-bound CSRF validation. Identity, role and approval status are never accepted from client-supplied profile fields. Every task/admin request checks current server-side approval; middleware or a hidden button is not the authorization boundary.

Tables have RLS enabled and public access revoked. Server RPCs use SECURITY INVOKER, explicit service_role-only execution privileges and an empty search_path. Never import lib/auth/store.ts in browser code.

The dependency-free Google verifier uses Node crypto, fixed Google HTTPS signing keys and RS256 only, with signature, issuer, audience, authorized party, lifetime, subject, nonce, verified-email and hosted-domain checks. Google recommends a maintained API/JWT library for production verification. Include this layer in independent security review before release, or replace it with an approved maintained library while retaining the same domain, nonce and approval checks.

Configure platform rate limiting for public sign-in endpoints before employee rollout. This patch does not provision firewall/rate-limit rules or email delivery.

## Verification

```sh
npm ci
npx tsc -p tests/tsconfig.json --noEmitOnError
node --test .auth-tests/tests/auth.test.js
npm run build
```

On October 6, 2026, all 42 isolated authentication tests passed locally, including forged/expired/wrong-domain tokens and authorization boundaries. That is not an end-to-end Google login or database test. Deployment build results are recorded separately on the pull request.

Before release, verify:

- Anonymous requests cannot access the dashboard, task API or admin API.
- Avinash's real Google account enters as approved Super Admin; a second company account becomes pending exactly once.
- Pending users cannot read tasks. Approval enables access; ordinary users cannot approve themselves.
- Rejection and revocation survive another sign-in; revoked sessions no longer work.
- Real Google sign-in, logout, expiry, cross-origin rejection, service outages, mobile layout and existing task filters work.
- The SQL smoke suite and security advisors pass against the selected database.

No live administrator account is created merely by committing this source. The setup script must be applied and the real account must authenticate.

## Primary documentation

- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/api/securing-your-api
- https://nextjs.org/docs/app/guides/authentication

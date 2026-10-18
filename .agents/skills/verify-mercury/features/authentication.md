# Managed authentication

The official Neon SDK uses same-origin `/api/auth/*` requests. The Worker checks the current managed session before private database access. Browser session loading, anonymous access, unavailable auth, and authenticated access are separate states.

## Drive signup and sessions

Run the configured live suite from the parent skill. It creates a child branch, retrieves or enables child Auth, enables email/password, disables required email verification on that child, and trusts the owned Worker's exact origin. Plain Playwright fills **Name**, **Email**, and **Password**, submits **Create account**, signs out with **Sign out**, and signs back in with **Sign in**. Both users repeat this flow. Reload restores the owner session and todo. The second user's cookies cannot read that todo.

Inspect `browser/neon-auth-users.json`, `browser/checks.log`, `browser/network.log`, and the before and after PNG and ARIA files. Identity evidence includes user IDs and test email addresses. Never log full auth responses, session tokens, passwords, headers, or cookies.

## Check email with a real inbox

Use an isolated nonproduction environment with required OTP verification, automatic signup delivery, and your configured email provider. Use two addresses you control in a real inbox. This is a manual check, separate from the automated session suite.

1. Register both accounts through **Create account**. Confirm that each has no session and `/api/todos` returns 401 before verification.
2. Enter the actual initial email code for the first account. For the second account, click **Resend code** and enter the actual code from the new message. Confirm `emailVerified: true` and record each nonsecret user ID. Signup must make no extra OTP-send request, and one resend click must make exactly one.
3. Create a private todo as the first account and reload. Confirm that the second account cannot read it, then sign out.
4. Open **Forgot your password?** for the first account and submit **Send reset code**. Confirm receipt, click **Resend reset code**, and enter the actual code from that new message with a new password. Submit **Reset password**.
5. Confirm that the old password fails with no session. Sign in with the new password and confirm the same user ID and private todo after reload. Sign out and remove only the test users and resources you created.

Use newly received messages for resends. Never fabricate codes or read internal auth tables as delivery proof. Keep passwords, codes, email bodies, session cookies, and tokens out of logs and screenshots. Record only nonsecret outcomes and delivery metadata. The automated live suite disables required verification and does not prove email delivery or password recovery. Verify production SMTP separately.

## Drive deployed sessions

Run `.agents/skills/verify-mercury/scripts/run.sh --deployed` with the parent skill's Neon and Cloudflare configuration. The same browser session and ownership assertions run against the unique deployed workers.dev HTTPS origin and an actual Hyperdrive binding. The owned child disables required verification, so check email separately with the manual recipe. Inspect `.audit/deployed-<timestamp>/browser/`, the restricted runtime-role evidence, and resource deletion readbacks. Custom-domain DNS and TLS need separate proof.

## Verify failures

Deterministic auth and route tests exercise loading, upstream failures, malformed sessions, expired or revoked sessions, exact-origin checks, and private-cache clearing. They run the actual SDK boundary but do not prove managed service availability. The built Worker check proves anonymous authorization only. Missing live credentials fail and leave live proof missing.

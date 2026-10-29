# Service setup

## 1. Supabase Auth

Create a dedicated Supabase project. Enable email/password sign-in and email confirmation. Set a password minimum of at least 8 characters. Configure production SMTP before inviting users; the default mail service is intended for limited testing.

Add `ividipoker://auth/callback` to the allowed redirect URLs. Set the Site URL to a real HTTPS page that tells users their email has been confirmed and that they can return to the app.

For the **Reset Password** email template, include `{{ .Token }}` as a visible one-time code. The app asks for this code and a new password. It verifies the code with type `recovery`, then updates the password. Configure expiry and rate limits in Supabase. Confirmation emails may keep their standard confirmation link.

Keep separate development and production projects. Do not enable anonymous sign-in for this app.

## 2. Social sign-in

All three providers use Supabase's hosted OAuth flow. The app generates a random PKCE verifier, opens the system authentication browser, and exchanges the callback code. Provider client secrets stay in Supabase.

- **Google:** create a Web OAuth client in Google Cloud, configure the consent screen, and register `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as its redirect URI. Enable Google in Supabase and enter the client ID and secret. Publish the consent screen when ready.
- **Microsoft:** register an app in Microsoft Entra. Choose the supported account audience deliberately, including personal Microsoft accounts if wanted. Add the same Supabase callback as a Web redirect URI. Enable Azure in Supabase with the client ID, secret and tenant URL. The app requests the `email` scope.
- **Apple:** create a Sign in with Apple Services ID, configure the domain and the Supabase HTTPS callback, and enter the Services ID and generated secret in Supabase. This implementation uses browser OAuth, not a native Apple identity-token flow. Rotate the Apple OAuth secret before it expires. Follow Apple's account deletion/token revocation requirements before App Store distribution; verify the project's Supabase/provider revocation behaviour rather than assuming deleting an Auth user revokes Apple consent.

Official guides:

- [Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Microsoft](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Password authentication](https://supabase.com/docs/guides/auth/passwords)

## 3. Server

Node.js 22.9 or newer is required. No npm dependencies are needed.

```bash
cd server
cp .env.example .env
# Fill in the values in .env using your editor.
npm test
npm start
```

Environment variables:

| Name | Purpose |
|---|---|
| `PORT` | Listening port, default 8080 |
| `SUPABASE_URL` | HTTPS project URL |
| `SUPABASE_ANON_KEY` | Public project key used to verify user sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server-only key for account deletion |
| `DATA_FILE` | Writable private file for table snapshots |
| `TRUST_PROXY` | Set to `1` only behind a reverse proxy that appends `X-Forwarded-For`, so address limits apply per client |

Deploy the supplied Dockerfile to a service with HTTPS termination and a persistent volume mounted at `/data`. Inject environment variables using the host's secret settings. Do not expose the snapshot directory over HTTP: it includes unplayed cards and private hands.

Run **one server instance**. This initial implementation uses synchronous atomic file snapshots and in-process tables, not a distributed database or shared lock service. Horizontal scaling requires a shared transactional store and per-table concurrency control first. Host-level connection limits and a reverse-proxy rate limiter should complement the server's per-user and per-address limits.

`GET /health` is public. Every table endpoint verifies the supplied access token with Supabase Auth; a verified token is reused for up to 30 seconds so that table polling does not query Supabase on every request. There are no guest or development authentication bypasses in the server.

The server saves state before acknowledging mutations. On restart it reloads the file and resumes expired turns. Dormant tables expire after 24 hours once a hand is complete. Schedule restricted, encrypted backups of the volume if recovery beyond a server restart is needed. A lost volume loses the virtual-chip tables, not the Supabase accounts.

## 4. App

Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` and set:

- `POKER_API_URL`: public HTTPS origin of the poker server, without a trailing slash.
- `SUPABASE_URL`: project URL, without a trailing slash.
- `SUPABASE_ANON_KEY`: public project key.

xcconfig treats `//` as a comment, so use the `$(SLASH)` notation shown in the example. Never add the service-role key or provider secrets to this file. It is ignored by Git.

Run `xcodegen generate` if project sources change. Select the appropriate scheme, set your Apple signing team locally, and build. No developer team is hard-coded in the repository.

## 5. Before public release

Verify all four sign-in methods, email confirmation, recovery, refresh, sign-out and deletion with real test accounts. Complete the device checklist in [VALIDATION.md](VALIDATION.md). Publish a privacy policy describing Supabase, hosting, retention and account deletion, and configure App Store privacy disclosures and the appropriate simulated-gambling age rating. Check Apple's current sign-in and account-deletion requirements with the actual provider configuration.

The app is a virtual-chip social game. No real-money wallet, payment flow or gambling service is implemented.

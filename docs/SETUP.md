# Service setup

## 1. Supabase Auth

Create a dedicated Supabase project. Enable email/password sign-in and email confirmation. Set a password minimum of at least 8 characters. Configure production SMTP before inviting users; the default mail service is intended for limited testing.

Set the Site URL to `ividipoker://auth/callback` and add the same address to the allowed redirect URLs.

Password recovery and account confirmation use the standard email links. The link opens the app through the `ividipoker://` scheme, which signs the user in; after a recovery link the app asks for a new password. No template changes are needed.

Supabase's built-in email service only delivers to members of your Supabase team and is heavily rate-limited. Before public release, either configure custom SMTP (Authentication → Emails → SMTP Settings) or turn off **Confirm email** so new accounts are active immediately. Password recovery for other people needs custom SMTP.

Keep separate development and production projects. Do not enable anonymous sign-in for this app.

## 2. Social sign-in

All three providers use Supabase's hosted OAuth flow. The app generates a random PKCE verifier, opens the system authentication browser, and exchanges the callback code. Provider client secrets stay in Supabase.

- **Google:** create a Web OAuth client in Google Cloud, configure the consent screen, and register `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as its redirect URI. Enable Google in Supabase and enter the client ID and secret. Publish the consent screen when ready.
- **Microsoft:** register an app in Microsoft Entra. Choose the supported account audience deliberately, including personal Microsoft accounts if wanted. Add the same Supabase callback as a Web redirect URI. Enable Azure in Supabase with the client ID, secret and tenant URL. The app requests the `email` scope.
- **Apple:** the app uses the native Sign in with Apple button on iPhone, iPad and Mac. Enable the Sign in with Apple capability for the App ID `dev.ividi.iVidiPoker`, then enable Apple in Supabase and add `dev.ividi.iVidiPoker` to its **Client IDs**. The native flow sends Apple's identity token with a hashed nonce, so no Services ID or rotating client secret is needed. Follow Apple's account deletion and token revocation requirements before App Store distribution.

Official guides:

- [Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Microsoft](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Password authentication](https://supabase.com/docs/guides/auth/passwords)

## 3. Server

The game server is a Supabase Edge Function named `poker`, in the same free project as the accounts. Each request loads only the tables it needs from the `rooms` table in Postgres and saves them only if nobody changed them in the meantime; a request that loses that race runs again on the newer table. Node.js 22.9 or newer is needed for the tests and the bundle.

1. Run `server/schema.sql` in the SQL Editor. The table has row level security and no policies, so only the function can read it.
2. Build the single-file bundle and deploy it as the `poker` function, from the dashboard editor (paste `dist/poker.js` into `index.ts`) or with the Supabase CLI:

```bash
cd server
npm test
npm run bundle   # writes dist/poker.js
```

3. In the function settings, turn off **Verify JWT with legacy secret**. The project signs sessions with asymmetric keys that this legacy check rejects; the function verifies every token with Supabase Auth itself.

The function uses the variables Supabase provides to every Edge Function, so there is nothing to configure and no secret to copy:

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | HTTPS project URL |
| `SUPABASE_ANON_KEY` | Public project key used to verify user sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for the `rooms` table and account deletion |

`GET /health` answers without touching the database. Every table endpoint verifies the supplied access token with Supabase Auth; a verified token is reused for up to 30 seconds so that table polling does not query Supabase on every request. Requests are limited per client address and per account.

Bots and expired turns advance whenever a player polls the table, so idle tables cost nothing. Tables expire 24 hours after the last completed hand. The stored tables include unplayed cards and private hands; they are only reachable with the service-role key.

The free plan includes 500,000 Edge Function calls a month. Each seated player polls every 1.5 seconds, which is about 2,400 calls an hour.

## 4. App

Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` and set:

- `POKER_API_URL`: the function URL, `https://YOUR-PROJECT.supabase.co/functions/v1/poker`, without a trailing slash.
- `SUPABASE_URL`: project URL, without a trailing slash.
- `SUPABASE_ANON_KEY`: public project key.

xcconfig treats `//` as a comment, so use the `$(SLASH)` notation shown in the example. Never add the service-role key or provider secrets to this file. It is ignored by Git.

Run `xcodegen generate` if project sources change. Select the appropriate scheme, set your Apple signing team locally, and build. Signing needs an App ID with the Sign in with Apple capability. No developer team is hard-coded in the repository.

## 5. Before public release

Verify all four sign-in methods, email confirmation, recovery, refresh, sign-out and deletion with real test accounts. Complete the device checklist in [VALIDATION.md](VALIDATION.md). The privacy policy is [PRIVACY.md](../PRIVACY.md); keep it in line with the App Store privacy answers, and configure App Store privacy disclosures and the appropriate simulated-gambling age rating. Check Apple's current sign-in and account-deletion requirements with the actual provider configuration.

The app is a virtual-chip social game. No real-money wallet, payment flow or gambling service is implemented.

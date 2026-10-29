# Validation

## Automated checks

| Check | Command | Result |
|---|---|---|
| Engine, strategy and API tests | `cd server && npm test` | 35 passing |
| Every five-card hand (2,598,960) | `cd server && npm run test:exhaustive` | Passing, category counts match |
| Native models against server snapshots | `scripts/check-native.sh` | 24 passing |
| macOS and iOS builds | `xcodebuild … build` (see README) | Passing, no Swift warnings |

The same checks run on every push through GitHub Actions.

### Engine

Unique shuffled decks, each player's own hand category from the flop onwards, all nine hand categories, ace-low straights, kickers, best five of seven cards, heads-up blind positions, the big-blind option, minimum raises, short all-ins that do not reopen raising, side pots, uncalled bets returned separately, split pots with odd chips, folds, turn timeouts and chip conservation across 100 randomly played hands. Hole cards stay frozen once a hand settles, so a player joining afterwards cannot see a previous winner's cards.

### Computer opponents

The strategy only receives the same private view a player sees. Tests change the opponents' cards and the remaining deck and confirm the decision does not change. Premium hands raise, weak hands fold expensive calls but never fold a free check, closed betting and short all-in limits are respected, a shared royal flush is never folded and weak kickers on shared trips are not overvalued.

### API

The tests drive the Edge Function end to end against an in-memory stand-in for the `rooms` table: authentication on every table endpoint, table creation and joining, host-only dealing, private hole cards, reconnection through `/me`, duplicate and stale actions, malformed request bodies, identity-service outages reported as unavailable rather than signed out, account deletion handing the table to the next host, a save that loses a race running again on the newer table, reuse of verified tokens while polling, per-address rate limits, bots acting when a table is polled, a failing table rolling back on its own, and tables being removed from storage when empty.

### App

Decoding of real server-generated snapshots, payouts and refunds, quick-bet sizing (half pot, pot, minimum raise and stack cap), localized card names for VoiceOver, HTTPS-only configuration URLs and access-token age.

## Before release

- Configure and deploy the server and the Supabase project.
- Verify email registration and confirmation, sign-in, recovery, token refresh and account deletion against the live project.
- Verify Google, Microsoft and Apple sign-in with real provider accounts on both platforms, including Apple authorization revocation on account deletion.
- Play full hands between an iPhone or iPad and a Mac on different networks, including airplane mode, backgrounding, server restarts and expired sessions.
- Check six-player layouts, VoiceOver and large accessibility text sizes on physical devices.
- Produce signed Release archives, host a privacy policy and complete the store metadata and age rating.

Each table is one Postgres row with a revision number; concurrent saves to the same table are retried, never merged. The free plan's 500,000 function calls a month is about 200 player-hours of polling.

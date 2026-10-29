# ♠️ iVidiPoker

> Texas Hold’em at the amber table. A native card game for iPhone, iPad and Mac, with private cross-platform tables, computer opponents for practice and virtual chips.

[![Report Bug](https://img.shields.io/badge/Report-Bug-red)](https://github.com/VidiPT89/iVidiPoker/issues)
[![Request Feature](https://img.shields.io/badge/Request-Feature-blue)](https://github.com/VidiPT89/iVidiPoker/issues)

<p align="center"><img src="iVidiPoker/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png" width="144" alt="iVidiPoker amber spade icon"></p>

## ✨ Features

- ✅ No-limit Texas Hold’em for 2 to 6 players, with blinds, four betting rounds, all-ins, side pots and split pots
- ✅ Private tables with shareable eight-character codes, cross-play between iPhone, iPad and Mac
- ✅ Practice tables with three computer opponents that bet, raise, call and fold based on their own cards and the board
- ✅ Server-controlled shuffling, private hole cards, turn validation and 45-second turn timers
- ✅ Half-pot, pot and all-in shortcuts, with a slider for any legal raise
- ✅ Reconnect to your table and hand after closing the app or losing the connection
- ✅ Email/password accounts with confirmation, password recovery and in-app account deletion
- ✅ Sign in with Apple, Google or Microsoft, using PKCE and Keychain session storage
- ✅ Animated community cards, haptic turn alert on iPhone and Reduce Motion support
- ✅ VoiceOver names for every card in Portuguese and English
- ✅ Runtime language switch: Português (PT-PT) and English
- ✅ Dark mode, Light mode and System mode
- ✅ Intro with developer credits, website and GitHub links
- ✅ Colour identity taken from [ividi.dev](https://ividi.dev/): amber, burnt yellow and near-black

**Virtual chips only.** No deposits, withdrawals, paid chips or cash prizes.

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Language | Swift 5.9, JavaScript (Node.js 22.9+) |
| UI | SwiftUI |
| Platforms | iOS 17+, iPadOS 17+, macOS 14+ |
| Authentication | Supabase Auth, AuthenticationServices, PKCE, Keychain |
| Game server | Node.js built-in HTTP and crypto modules, no dependencies |
| Synchronisation | Authenticated HTTPS snapshots, 1.5-second polling |
| Persistence | Atomic JSON snapshots on a persistent volume |
| Project | XcodeGen |
| Tests | Node.js test runner, native Swift contract checks, GitHub Actions |

## 🚀 Quick Start

### Prerequisites

- macOS with Xcode 15+
- Node.js 22.9+ for the game server
- A Supabase project and an HTTPS host for online play

### Installation

```bash
git clone https://github.com/VidiPT89/iVidiPoker.git
cd iVidiPoker
open iVidiPoker.xcodeproj
```

Select `iVidiPoker-iOS` or `iVidiPoker-macOS` and build (`⌘R`). Choose your signing team when running on a physical device.

> The Xcode project is generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. If you add or move Swift files, regenerate it with `xcodegen generate`.

### Online services

1. Follow [Service setup](docs/SETUP.md) to configure Supabase and the Apple, Google and Microsoft providers.
2. Deploy `server/` with HTTPS and a persistent volume (a Dockerfile is included).
3. Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` and enter the public URLs and the public Supabase key.
4. Rebuild the app, create an account, then create or join a table.

The server-only service-role key must never be placed in the app or committed to Git.

## 📖 Usage

1. Create a private table and share its code, or start a practice table against three computer opponents
2. Friends sign in on their own iPhone, iPad or Mac and enter the code
3. The host deals once at least two players with chips are seated
4. On your turn, choose **Fold**, **Check**/**Call** or **Bet**/**Raise**; ½ pot, Pot and All-in pick an amount before you confirm
5. If time runs out you check when possible, otherwise you fold
6. Leave between hands; an empty stack can take another 2,000 virtual chips

Language, appearance and account management are in Settings. The **?** button explains hand rankings and the flow of a hand.

## 🔌 API Endpoints

Every endpoint except `/health` requires `Authorization: Bearer <Supabase access token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/me` | Your current table, if any |
| POST | `/rooms` | Create a table (`{"practice": true}` for practice) |
| GET | `/rooms/{code}` | Table snapshot with only your own hole cards |
| POST | `/rooms/{code}/join` | Take a seat between hands |
| POST | `/rooms/{code}/start` | Deal the next hand (host only) |
| POST | `/rooms/{code}/action` | Fold, check, call or raise: `{"action", "amount", "version"}` |
| POST | `/rooms/{code}/rebuy` | Take 2,000 chips when your stack is empty |
| POST | `/rooms/{code}/leave` | Leave the table between hands |
| POST | `/account/delete` | Delete your account and seat |

## 🧪 Testing

```bash
cd server
npm test
npm run test:exhaustive
```

```bash
scripts/check-native.sh
xcodebuild -project iVidiPoker.xcodeproj -scheme iVidiPoker-macOS \
  -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project iVidiPoker.xcodeproj -scheme iVidiPoker-iOS \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

`check-native.sh` decodes server-generated snapshots with the app's own Swift models. See [Validation](docs/VALIDATION.md) for what is covered and the remaining release checks.

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

## 👨‍💻 Author

**David Arsénio Martins**

- 🌐 Website: [ividi.dev](https://ividi.dev/)
- 🐙 GitHub: [@VidiPT89](https://github.com/VidiPT89/)

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Feel free to check the [issues page](https://github.com/VidiPT89/iVidiPoker/issues).

---

<p align="center">Developed by <a href="https://ividi.dev">David Arsénio Martins</a></p>
<p align="center">⭐ If you like this project, give it a star!</p>

# 💰 MoFlo — Personal Finance Tracker

<p align="center">
  <img src="assets/icon.png" width="120" alt="MoFlo Logo" />
</p>

<p align="center">
  <strong>Take control of your money. Simple, visual and smart.</strong>
</p>

<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.oskartech.moflo">
    <img src="https://img.shields.io/badge/Google_Play-Download-green?style=for-the-badge&logo=google-play" />
  </a>
  <a href="https://apps.apple.com/app/id/com.oskartech.moflo">
    <img src="https://img.shields.io/badge/App_Store-Download-black?style=for-the-badge&logo=apple" />
  </a>
  <img src="https://img.shields.io/badge/version-1.3.3-blue?style=for-the-badge" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-0.81-blue?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Expo-54-black?style=for-the-badge&logo=expo" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Firebase-v23-orange?style=for-the-badge&logo=firebase" />
</p>

---

## ✨ Features

### Core
- 📊 **Dashboard** — Real-time balance with income, expenses and savings overview
- ➕ **Movements** — Track income, expenses and savings with custom categories
- 🔄 **Recurring Movements** — Automatic monthly fixed transactions
- 📈 **Annual Summary** — Charts and statistics for the full year
- 🐷 **Huchas (Savings Goals)** — Custom piggy banks with icons, colors and target amounts
- 👥 **Shared Accounts** — Share finances with family or partners, including shared categories
- 🔔 **Reminders** — Push notifications for important payments
- 🔔 **Daily Notifications** — Automatic daily reminder to log your movements
- 📤 **Data Export** — Export movements and huchas to CSV

### Account & Sync
- ☁️ **Cloud Sync** — Firebase Firestore sync with offline queue support
- 🔑 **Multi-provider Auth** — Email/Password, Google Sign-In and Apple Sign-In
- 🔒 **Biometric Lock** — Face ID / Touch ID / Fingerprint to protect the app
- 🔑 **Password Recovery** — Reset your password via email

### Premium (RevenueCat)
- 💎 **Premium Subscription** — Unlock advanced features
- 🔓 In-app purchases handled by RevenueCat (cross-platform entitlements)

### Personalization
- 🌙 **Dark / Light Mode** — Automatic theme based on system preferences
- 🌍 **Multi-language** — English, Spanish and Polish
- 💱 **Multi-currency** — EUR, USD, GBP, PLN, CHF, MXN
- 🎨 **Custom Categories** — Create your own with custom icons and colors

---

## 🛠️ Tech Stack

| Technology | Usage |
|---|---|
| React Native 0.81 + Expo 54 | Mobile framework |
| React 19 | UI library |
| TypeScript 5.9 | Language |
| Firebase Auth | Authentication (Email, Google, Apple) |
| Firebase Firestore | Database |
| Firebase Storage | Profile pictures |
| Zustand | State management |
| React Navigation 7 | Navigation |
| React Native Paper | UI components |
| Victory Native + Gifted Charts | Data visualization |
| RevenueCat | In-app purchases / subscriptions |
| i18next | Internationalization |
| Expo Notifications | Push notifications |
| Expo Local Authentication | Biometrics |
| EAS Build | CI/CD |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI / EAS CLI
- Android Studio (for Android emulator)
- Xcode (for iOS — macOS only)

### Installation
```bash
# Clone the repository
git clone https://github.com/OskarTech/MoFlo.git
cd MoFlo

# Install dependencies
npm install

# Add your Firebase config (not included in repo)
# - google-services.json (Android) in the root
# - GoogleService-Info.plist (iOS) in the root

# Start development server
npx expo start --dev-client
```

### Environment Setup

This project requires Firebase config files. You need to:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add an Android app with package `com.oskartech.moflo` and download `google-services.json`
3. Add an iOS app with bundle ID `com.oskartech.moflo` and download `GoogleService-Info.plist`
4. Place both files in the project root
5. Enable Authentication providers: Email/Password, Google, Apple
6. Enable Firestore Database and Storage
7. Configure RevenueCat with the Android/iOS API keys for premium features

---

## 🌍 Internationalization

MoFlo supports 3 languages. **All UI strings must be added to every locale file.**

| Language | Code | File |
|---|---|---|
| English | `en` | `src/i18n/locales/en.json` |
| Spanish | `es` | `src/i18n/locales/es.json` |
| Polish | `pl` | `src/i18n/locales/pl.json` |

---

## 🔒 Security

- All user data is protected by Firebase Security Rules
- Each user can only access their own data (or accounts they are explicitly shared with)
- Optional biometric lock on app open
- `google-services.json` and `GoogleService-Info.plist` are excluded from version control

---

## 📦 Build & Deploy

```bash
# Development build
eas build --profile development --platform android
eas build --profile development --platform ios

# Production build
eas build --profile production --platform android
eas build --profile production --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

---

## 📁 Project Structure

```
src/
├── components/        # Reusable UI components
├── constants/         # Categories, app constants
├── hooks/             # Custom hooks (theme, premium…)
├── i18n/              # Locales (en, es, pl)
├── navigation/        # React Navigation setup
├── screens/
│   ├── auth/          # Login, Register, ForgotPassword
│   └── app/           # Home, Movements, Huchas, Shared, Settings…
├── services/
│   ├── firebase/      # Auth, Firestore, Apple Auth
│   ├── export.service.ts
│   └── syncQueue.service.ts
├── store/             # Zustand stores
├── theme/             # Light / dark themes
├── types/             # TypeScript types
└── utils/             # Helpers, formatters, prompts
```

---

## 📄 Privacy Policy

[Privacy Policy](https://oskartech.github.io/moflo-privacy/)

[Delete Account](https://oskartech.github.io/moflo-privacy/delete-account.html)

---

## 👨‍💻 Developer

**OskarTech**
- GitHub: [@OskarTech](https://github.com/OskarTech)
- Email: oskartech.dev@gmail.com

---

## 📝 License

This project is private and proprietary. All rights reserved © 2026 OskarTech.

---

<p align="center">Made with ❤️ by OskarTech</p>

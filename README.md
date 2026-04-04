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
  <img src="https://img.shields.io/badge/React_Native-0.76-blue?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Expo-52-black?style=for-the-badge&logo=expo" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Firebase-v10-orange?style=for-the-badge&logo=firebase" />
</p>

---

## ✨ Features

- 📊 **Dashboard** — Real-time balance with income, expenses and savings overview
- ➕ **Add Movements** — Track income, expenses and savings with categories
- 🔄 **Fixed Movements** — Automatic monthly recurring transactions
- 📈 **Annual Summary** — Charts and statistics for the full year
- 🔔 **Reminders** — Push notifications for important payments
- 🔔 **Daily Notifications** — Automatic daily reminder to add your movements
- ☁️ **Cloud Sync** — Firebase Firestore sync with offline support
- 🌙 **Dark/Light Mode** — Automatic theme based on system preferences
- 🌍 **Multi-language** — English, Spanish and Polish
- 💱 **Multi-currency** — EUR, USD, GBP, PLN, CHF, MXN
- 🔑 **Password Recovery** — Reset your password via email

---

## 🛠️ Tech Stack

| Technology | Usage |
|---|---|
| React Native + Expo | Mobile framework |
| TypeScript | Language |
| Firebase Auth | Authentication |
| Firebase Firestore | Database |
| Zustand | State management |
| React Navigation | Navigation |
| React Native Paper | UI components |
| i18next | Internationalization |
| EAS Build | CI/CD |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI
- EAS CLI
- Android Studio (for emulator)

### Installation
```bash
# Clone the repository
git clone https://github.com/OskarTech/MoFlo.git
cd MoFlo

# Install dependencies
npm install

# Add your Firebase config (not included in repo)
# Download google-services.json from Firebase Console
# Place it in the root directory

# Start development server
npx expo start --dev-client
```

### Environment Setup

This project requires a `google-services.json` file from Firebase. You need to:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add an Android app with package `com.oskartech.moflo`
3. Download `google-services.json` and place it in the root directory
4. Enable Authentication (Email/Password + Google Sign-In)
5. Enable Firestore Database

---

## 📁 Project Structure

MoFlo/
├── src/
│   ├── components/       # Reusable components
│   │   ├── common/       # AppHeader, AddTabButton
│   │   └── movements/    # Movement modals
│   ├── navigation/       # React Navigation setup
│   ├── screens/
│   │   ├── auth/         # Login, Register, ForgotPassword
│   │   └── app/          # Home, Historial, Annual, Recurring...
│   ├── services/
│   │   └── firebase/     # Auth, Firestore services
│   ├── store/            # Zustand stores
│   ├── theme/            # Colors and themes
│   ├── i18n/             # Translations (en, es, pl)
│   └── types/            # TypeScript types
├── assets/               # Icons, splash screen
├── app.json              # Expo config
└── eas.json              # EAS Build config

---

## 🌍 Internationalization

MoFlo supports 3 languages:

| Language | Code | Status |
|---|---|---|
| English | `en` | ✅ Complete |
| Spanish | `es` | ✅ Complete |
| Polish | `pl` | ✅ Complete |

---

## 🔒 Security

- All user data is protected by Firebase Security Rules
- Each user can only access their own data
- `google-services.json` is excluded from version control

---

## 📦 Build & Deploy
```bash
# Development build
eas build --profile development --platform android

# Production build
eas build --profile production --platform android
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

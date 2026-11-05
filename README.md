# NumberOps — Vercel + Firebase

Advanced responsive admin dashboard for **consent-based number management**. Includes Firebase Authentication, Firestore live updates, bulk import, status tracking, CSV export, audit activity, and optional Telegram status notifications.

## Scope and safety

This app deliberately does **not** automate WhatsApp account registration, request WhatsApp OTPs, retrieve OTPs from Telegram groups, or store/forward authentication codes. Those are account credentials and could enable unauthorized account access. Use the official WhatsApp/Meta onboarding flow; this dashboard only tracks owner-confirmed progress.

## 1. Install and run locally

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the Vite URL printed in the terminal.

## 2. Firebase setup

This package is prefilled with the Movie Hub Firebase **web app configuration** supplied for this project. Firebase web config values identify the project; they are not admin credentials. Firestore Security Rules and Firebase Authentication are what protect records.

In Firebase Console for project `moviehub-83f43`:

1. Authentication → Sign-in method → enable **Email/Password**.
2. Authentication → Settings → Authorized domains → add your Vercel domain after deployment.
3. Firestore Database → create a database if one does not already exist.
4. Firestore → Rules: merge the contents of `firestore.rules` into your existing rules. Replace `REPLACE_WITH_ADMIN_EMAIL` with the exact admin email. Do not overwrite Movie Hub rules blindly; preserve its existing collection matches.
5. Create an admin user in Authentication. Verify the email if your project requires verified email.

**Important:** The signup link in the starter UI is convenient for initial setup. For production, create the admin user yourself, then remove public signup by changing the UI to login-only or restricting account creation. Only allow trusted admin emails in Firestore rules.

The app uses dedicated top-level collections:
- `number_operations_numbers`
- `number_operations_activity`

It does not read or write Movie Hub's existing collections.

## 3. Telegram status notifications (optional)

The bot sends operational status notifications only. It does not read Telegram groups or process OTP messages.

In Telegram, create a bot using the official BotFather, add it to a private admin group, and obtain the target chat ID. In Vercel → Project → Settings → Environment Variables, set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ADMIN_EMAILS` (comma-separated admin email allowlist)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (the full service-account JSON as one environment-variable value)

To get the service account: Firebase Console → Project settings → Service accounts → Generate new private key. Keep this JSON private. Never put it in the frontend, source control, or any `VITE_` variable. Rotate it if exposed.

If Telegram is not configured, the dashboard still works; notifications are simply skipped.

## 4. Deploy to Vercel

1. Push this folder to a private GitHub repository.
2. In Vercel, import the repository.
3. Add every `VITE_FIREBASE_*` value from `.env.example` in Project Settings → Environment Variables.
4. Add the server-only variables listed above if Telegram alerts are required.
5. Deploy. Build command: `npm run build`; output directory: `dist`.
6. Add your deployed domain to Firebase Authentication's authorized domains.
7. Test sign-in, add one test record, update status, refresh, and verify the record remains in Firestore.

## 5. Security notes before production

- Replace the admin email placeholder in Firestore rules before deploying.
- Keep Firestore rules restrictive. Never use `allow read, write: if true`.
- Remove public sign-up after creating the intended admin account.
- Store service-account JSON only in Vercel server-side environment variables.
- Use a dedicated Firebase project for production if possible. Reusing Movie Hub is technically supported by separate collections, but a separate project gives stronger isolation and reduces the risk of changing Movie Hub's security rules accidentally.
- Add MFA for admin accounts and restrict access to trusted administrators.
- Do not store OTPs, passwords, recovery codes, or session credentials in Firestore or Telegram.

## Included features

- Premium dark responsive admin interface
- Firebase email/password authentication
- Firestore real-time records
- Bulk paste import with E.164 validation and duplicate removal within each import
- Status workflow: queued, owner confirmed, completed, failed
- Search and status filtering
- CSV export
- Activity/audit log
- Optional Telegram status notifications through a protected Vercel serverless endpoint
- Vercel configuration and Firestore rules starter

# NumberOps update

## Added
- A per-number action to record that the admin has requested the owner to complete verification directly in the official WhatsApp app.
- A `verification_requested` status and dashboard metric.
- Audit-log entries and optional Telegram status notifications for this owner-verification request.
- Firestore rules updated to allow the new status.

## Important limitation
This update does not send a WhatsApp verification-code request. It does not access WhatsApp registration endpoints, receive or collect OTPs, or read Telegram groups for authentication codes. The Telegram bot only sends an administrative notification telling the owner to complete verification directly in WhatsApp.

## Deploy
1. Merge the Firestore rules into the existing Firebase rules (do not replace unrelated application rules).
2. Ensure Vercel environment variables are configured as described in README.md.
3. Commit and push, or deploy the ZIP as a Vite/Vercel project.

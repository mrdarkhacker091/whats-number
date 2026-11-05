import admin from "firebase-admin";

function getAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Server Firebase credentials are not configured");
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.app();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: "Authentication required" });
    const app = getAdmin();
    const decoded = await admin.auth(app).verifyIdToken(match[1]);
    const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!decoded.email || !allowed.includes(decoded.email.toLowerCase())) {
      return res.status(403).json({ error: "Administrator access required" });
    }
    const message = String(req.body?.message || "").trim().slice(0, 3000);
    if (!message) return res.status(400).json({ error: "Message is required" });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return res.status(200).json({ sent: false, configured: false });
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) return res.status(502).json({ error: "Telegram delivery failed" });
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error("Telegram notify error:", error.message);
    return res.status(500).json({ error: "Notification service is not configured correctly" });
  }
}
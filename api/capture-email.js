import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, source } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  // Insert into Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("email_captures").insert({ email, source: source || "unknown" });
    } catch (err) {
      console.error("Supabase insert error:", err);
    }
  }

  // Add to Resend audience
  const resendKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (resendKey && audienceId) {
    try {
      await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    } catch (err) {
      console.error("Resend audience error:", err);
    }
  }

  return res.status(200).json({ ok: true });
}

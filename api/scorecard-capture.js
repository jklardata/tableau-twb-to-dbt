import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, score, tier, dimension_scores, timestamp } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  // Save to Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("scorecard_leads").insert({
        name,
        email,
        score,
        tier,
        dimension_scores,
        submitted_at: timestamp || new Date().toISOString(),
        source: "semantic-layer-scorecard",
      });
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
        body: JSON.stringify({
          email,
          first_name: name?.split(" ")[0] || "",
          last_name: name?.split(" ").slice(1).join(" ") || "",
          unsubscribed: false,
        }),
      });
    } catch (err) {
      console.error("Resend audience error:", err);
    }
  }

  // Send notification email to justin
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Scorecard <support@tableautodbt.com>",
          to: ["justin@solofi.io"],
          subject: `New scorecard lead: ${name} (${tier} — ${score}/90)`,
          html: `
            <p><strong>${name}</strong> (${email}) completed the Semantic Layer Scorecard.</p>
            <p>Score: <strong>${score}/90</strong> — Tier: <strong>${tier}</strong></p>
            <h3>Dimension Scores:</h3>
            <ul>
              ${Object.entries(dimension_scores || {}).map(([k, v]) => `<li>${k}: ${v}/18</li>`).join("")}
            </ul>
            <p>Submitted: ${timestamp}</p>
          `,
        }),
      });
    } catch (err) {
      console.error("Resend notification error:", err);
    }
  }

  return res.status(200).json({ ok: true });
}

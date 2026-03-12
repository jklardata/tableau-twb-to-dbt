export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, source } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Graceful fallback — don't block the download if Resend isn't configured
    console.warn("RESEND_API_KEY not configured — email not captured");
    return res.status(200).json({ ok: true });
  }

  try {
    // Add to Resend audience (replace with your audience ID)
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    if (audienceId) {
      await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    }

    // Send a welcome/delivery email
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Tableau → dbt Exporter <support@solofi.io>",
        to: [email],
        subject: "Your dbt export is ready",
        html: `
          <div style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 32px; background: #030f0a; color: #e2ede8;">
            <div style="font-size: 18px; font-weight: 700; color: #34d399; margin-bottom: 16px;">
              tableau → dbt
            </div>
            <p style="color: #9ca3af; line-height: 1.6; margin-bottom: 16px;">
              Your free export is downloading now. Here's a quick reminder of what you got:
            </p>
            <ul style="color: #6b7280; line-height: 2; padding-left: 20px;">
              <li>SQL models for each calculated field</li>
              <li>schema.yml with auto-generated descriptions</li>
              <li>sources.yml template for your Snowflake setup</li>
              <li>Translation report with review checklist</li>
            </ul>
            <p style="color: #4b5563; font-size: 12px; margin-top: 24px;">
              Need to export a larger workbook? Unlimited fields start at $19/workbook.<br/>
              Reply to this email with any questions.
            </p>
          </div>
        `,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Email capture error:", err);
    // Don't block the download on email failure
    return res.status(200).json({ ok: true });
  }
}

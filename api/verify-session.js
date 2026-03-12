import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === "paid";
    return res.status(200).json({ paid });
  } catch (err) {
    return res.status(500).json({ error: err.message, paid: false });
  }
}

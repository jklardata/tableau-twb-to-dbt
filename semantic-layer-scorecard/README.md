# Semantic Layer AI Readiness Scorecard

A standalone React SPA that helps data teams assess whether their semantic layer is ready for agentic AI workloads. Takes ~5 minutes to complete and produces a scored, tier-based report with a personalized remediation roadmap.

**Live at:** [tableautodbt.com/scorecard](https://tableautodbt.com/scorecard)

---

## What this tool is

The scorecard assesses readiness across 5 dimensions (6 questions each = 30 questions total):

1. **Metric Definition Coverage** — Are your metrics formally defined, governed, and owned?
2. **Access Control Granularity** — Are permissions fine-grained enough for agent access?
3. **Lineage & Traceability** — Is metric provenance traceable end-to-end?
4. **Agent Query Tolerance** — Can your infrastructure handle agent-driven query patterns?
5. **Governance Maturity** — Is your organization ready, not just your tech?

**Scoring:** Each of 30 questions scores 0–3. Max total: 90.

**Tiers:**
- 0–29: Structurally Exposed (red)
- 30–54: Partially Governed (orange)
- 55–74: Governance Aware (yellow)
- 75–90: Agent-Ready (green)

After completing the assessment, users see an ungated results screen with a radar chart and dimension scores, then unlock the full remediation roadmap by entering their name and email.

---

## Tech Stack

- Vite + React 18
- Tailwind CSS
- Recharts (radar chart)
- jsPDF + html2canvas (PDF export)
- No backend — webhook POST for email capture

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Webhook Configuration

The email gate form POSTs to a configurable webhook endpoint. Set the URL via environment variable:

```bash
# .env.local
VITE_WEBHOOK_URL=https://your-webhook-endpoint.com/scorecard-leads
```

The webhook receives a JSON payload:

```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "score": 47,
  "tier": "partially_governed",
  "dimension_scores": {
    "metric_definition": 9,
    "access_control": 6,
    "lineage": 8,
    "query_tolerance": 10,
    "governance": 14
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

If `VITE_WEBHOOK_URL` is not set, the form submission still succeeds and shows the full report — the webhook POST is simply skipped.

Compatible webhook targets: Make, n8n, Zapier, Pipedream, a custom serverless function, etc.

---

## Deploy to Vercel

This is a standalone Vite app. Deploy it as a separate Vercel project targeting `tableautodbt.com/scorecard`.

### Option A: Separate Vercel Project

1. Create a new Vercel project pointing to `semantic-layer-scorecard/` as the root directory.
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variable: `VITE_WEBHOOK_URL`
5. Configure custom domain: `tableautodbt.com` → path `/scorecard`

### Option B: As a subpath of the main project

The `semantic-layer-scorecard/vercel.json` handles SPA routing:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## Embedding in TableautoDbt Hub

The scorecard is linked from the main tableautodbt.com navigation as "Scorecard". The nav has been added to:

- `public/landing-convert.html`
- `public/landing-audit.html`
- `public/landing-diff.html`
- `public/landing-docs.html`
- `src/App.jsx` (Convert app)
- `src/pages/AuditPage.jsx`
- `src/pages/DiffPage.jsx`
- `src/pages/DocsPage.jsx`
- `src/pages/MethodologyPage.jsx`
- `src/pages/InsightsPage.jsx`

---

## Analytics

GTM-compatible `dataLayer` events are pushed at key moments:

| Event | When | Properties |
|---|---|---|
| `assessment_started` | Start Assessment clicked | — |
| `dimension_completed` | Next clicked on each dimension | `{ dimension: 1-5 }` |
| `results_viewed` | Results screen shown | `{ score, tier }` |
| `email_submitted` | Email form submitted | `{ tier }` |

---

## File Structure

```
semantic-layer-scorecard/
├── src/
│   ├── components/
│   │   ├── LandingScreen.jsx      — Hero + CTA
│   │   ├── AssessmentScreen.jsx   — Paginated 5-dim questionnaire
│   │   ├── CalculatingScreen.jsx  — 2.5s animated analysis screen
│   │   ├── ResultsScreen.jsx      — Tier badge + radar + dimension cards
│   │   ├── EmailGateScreen.jsx    — Email form + full remediation report + PDF
│   │   ├── RadarChart.jsx         — Recharts radar wrapper
│   │   └── DimensionCard.jsx      — Reusable dimension score card
│   ├── data/
│   │   └── questions.js           — All 30 questions + remediation copy
│   ├── utils/
│   │   └── scoring.js             — Scoring logic + tier definitions
│   ├── App.jsx                    — Screen state machine
│   ├── main.jsx                   — React entry point
│   └── index.css                  — Tailwind + base styles
├── public/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── README.md
```

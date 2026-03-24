export const dimensions = [
  {
    id: 1,
    name: "Metric Definition Coverage",
    shortName: "Metric Definition",
    description: "Assesses whether metrics are formally defined, documented, and owned.",
    icon: "📐",
    questions: [
      {
        id: "q1_1",
        text: "What % of your core business metrics have a formal written definition (grain, filters, aggregation logic)?",
        options: ["<25%", "25–50%", "50–75%", ">75%"],
      },
      {
        id: "q1_2",
        text: "Do your metric definitions live in a governed, version-controlled system (dbt metrics, LookML, Cube, AtScale)?",
        options: ["No system exists", "Ad hoc docs/wiki", "Partial coverage", "Yes, fully governed"],
      },
      {
        id: "q1_3",
        text: "Are metric owners assigned and accountable for definition accuracy?",
        options: ["No ownership", "Informal ownership", "Some metrics owned", "All metrics have owners"],
      },
      {
        id: "q1_4",
        text: "How often do metric definitions get reviewed or updated?",
        options: ["Never/rarely", "Annually", "Quarterly", "Continuously"],
      },
      {
        id: "q1_5",
        text: "Do you have a single source of truth for each metric, or do duplicates exist across tools?",
        options: ["Many duplicates", "Some duplicates", "Mostly consolidated", "Single source of truth"],
      },
      {
        id: "q1_6",
        text: "Can a new team member find the correct metric definition without asking a colleague?",
        options: ["Almost never", "Sometimes", "Usually", "Always"],
      },
    ],
    remediation: [
      {
        gap: "Undefined or undocumented metrics",
        action: "Implement dbt metrics or a semantic layer tool with formal metric definitions. Start with your top 20 revenue-driving metrics.",
      },
      {
        gap: "No single source of truth",
        action: "Audit duplicate metric definitions across tools. Consolidate to one governed system before adding agent consumers.",
      },
      {
        gap: "No metric ownership",
        action: "Assign metric stewards. Each core metric needs an accountable owner who reviews and approves definition changes.",
      },
    ],
  },
  {
    id: 2,
    name: "Access Control Granularity",
    shortName: "Access Control",
    description: "Assesses whether permissions are fine-grained enough for agent access.",
    icon: "🔐",
    questions: [
      {
        id: "q2_1",
        text: "What is the finest level of data access control you currently enforce?",
        options: ["Table-level only", "Schema-level", "Column-level", "Row + column level"],
      },
      {
        id: "q2_2",
        text: "Are sensitive or PII fields tagged and identifiable in your semantic layer?",
        options: ["Not tagged", "Partially tagged", "Mostly tagged", "Fully tagged with lineage"],
      },
      {
        id: "q2_3",
        text: "Can you grant read access to specific metrics without exposing underlying tables?",
        options: ["No — table access required", "Partially", "Mostly", "Yes — metric-level permissions"],
      },
      {
        id: "q2_4",
        text: "Do your access policies differentiate between human users and programmatic/agent access?",
        options: ["No distinction", "Under discussion", "Partial implementation", "Fully differentiated"],
      },
      {
        id: "q2_5",
        text: "How are access policy changes documented and audited?",
        options: ["Not documented", "Manual notes", "Partial audit trail", "Full automated audit log"],
      },
      {
        id: "q2_6",
        text: "If an agent joined two datasets today, would you know if it touched PII?",
        options: ["No way to know", "Possibly via logs", "Probably yes", "Definitely — real-time alerts"],
      },
    ],
    remediation: [
      {
        gap: "Table-level access only",
        action: "Migrate to column-level or metric-level permissions. Agents need scoped access — broad table grants are a governance liability.",
      },
      {
        gap: "PII not tagged",
        action: "Run a PII discovery scan and tag sensitive fields in your catalog. Agents must not be able to inadvertently access personal data.",
      },
      {
        gap: "No human/agent access differentiation",
        action: "Create separate service accounts for agent access with explicit permission scopes logged separately from human access.",
      },
    ],
  },
  {
    id: 3,
    name: "Lineage & Traceability",
    shortName: "Lineage",
    description: "Assesses whether metric provenance is traceable end-to-end.",
    icon: "🔗",
    questions: [
      {
        id: "q3_1",
        text: "Can you trace any published metric back to its source table(s) without tribal knowledge?",
        options: ["No", "Partially", "Mostly", "Yes — automated lineage"],
      },
      {
        id: "q3_2",
        text: "Is column-level lineage documented for your critical metrics?",
        options: ["Not at all", "Some key metrics", "Most metrics", "All metrics"],
      },
      {
        id: "q3_3",
        text: "Do you know which dashboards/reports would break if a source table changed?",
        options: ["No", "We'd find out when it breaks", "Partial impact analysis", "Yes — automated impact analysis"],
      },
      {
        id: "q3_4",
        text: "Are dbt/transformation models documented with clear descriptions and tests?",
        options: ["Undocumented", "Partially documented", "Mostly documented", "Fully documented + tested"],
      },
      {
        id: "q3_5",
        text: "When a metric value changes unexpectedly, how long does root cause take?",
        options: ["Days/weeks", "Hours", "Under an hour", "Near-instant via observability tooling"],
      },
      {
        id: "q3_6",
        text: "Is your lineage metadata accessible programmatically (API, catalog)?",
        options: ["Not accessible", "Manual export only", "Partial API", "Full programmatic access"],
      },
    ],
    remediation: [
      {
        gap: "No automated lineage",
        action: "Implement dbt's built-in lineage or a catalog tool (Atlan, DataHub, Alation). Agents need traceable provenance to be auditable.",
      },
      {
        gap: "No impact analysis",
        action: "Before agents run in production, you need to know what breaks when upstream tables change. Automate impact analysis.",
      },
      {
        gap: "Lineage not API-accessible",
        action: "Expose lineage metadata via API. Agents need programmatic access to understand what they're querying.",
      },
    ],
  },
  {
    id: 4,
    name: "Agent Query Tolerance",
    shortName: "Query Tolerance",
    description: "Assesses whether the infrastructure can handle agent-driven query patterns.",
    icon: "⚡",
    questions: [
      {
        id: "q4_1",
        text: "Was your semantic layer designed with automated/high-frequency query patterns in mind?",
        options: ["No — built for human BI", "Somewhat", "Mostly", "Yes — agent-ready architecture"],
      },
      {
        id: "q4_2",
        text: "Do you have query rate limiting or cost governance on your warehouse/semantic layer?",
        options: ["None", "Basic limits", "Role-based limits", "Dynamic, policy-driven governance"],
      },
      {
        id: "q4_3",
        text: "Are your metrics optimized for programmatic consumption (clean APIs, stable schemas)?",
        options: ["Not optimized", "Some endpoints", "Mostly stable", "Fully stable + versioned"],
      },
      {
        id: "q4_4",
        text: "Can an agent query your semantic layer without needing to understand raw table schemas?",
        options: ["No — raw access required", "Partially abstracted", "Mostly abstracted", "Fully abstracted"],
      },
      {
        id: "q4_5",
        text: "Do you have query observability — monitoring what's being queried and how often?",
        options: ["No monitoring", "Basic logging", "Dashboards", "Real-time observability + alerting"],
      },
      {
        id: "q4_6",
        text: "If an agent ran 500 queries in 10 minutes today, what would happen?",
        options: ["Warehouse would break", "No idea", "We'd see it eventually", "Real-time alert + auto-throttle"],
      },
    ],
    remediation: [
      {
        gap: "No rate limiting",
        action: "Implement warehouse cost governance (Snowflake resource monitors, BigQuery slot limits) before enabling agent access at scale.",
      },
      {
        gap: "Raw schema access required",
        action: "Build a semantic abstraction layer (dbt metrics, Cube, LookML) so agents query metrics, not raw tables.",
      },
      {
        gap: "No query observability",
        action: "Implement query logging and monitoring. You cannot govern what you cannot see.",
      },
    ],
  },
  {
    id: 5,
    name: "Governance Maturity",
    shortName: "Governance",
    description: "Assesses organizational readiness, not just technical infrastructure.",
    icon: "🏛️",
    questions: [
      {
        id: "q5_1",
        text: "Does your organization have a data governance policy that explicitly addresses AI/agent access?",
        options: ["No policy", "Policy under development", "Partial policy", "Full policy in place"],
      },
      {
        id: "q5_2",
        text: "Is there a designated owner for semantic layer governance (person or team)?",
        options: ["No owner", "Informally assigned", "Partially staffed", "Dedicated owner/team"],
      },
      {
        id: "q5_3",
        text: "How are new metrics or data assets approved before agents can consume them?",
        options: ["No process", "Ad hoc", "Informal checklist", "Formal approval workflow"],
      },
      {
        id: "q5_4",
        text: "Do your data contracts or SLAs cover agent consumers, not just human dashboards?",
        options: ["No contracts", "Human-only contracts", "Under discussion", "Agent-inclusive contracts"],
      },
      {
        id: "q5_5",
        text: "How confident are you that an agent using your semantic layer today would return correct answers?",
        options: ["Not confident", "Somewhat confident", "Mostly confident", "Very confident"],
      },
      {
        id: "q5_6",
        text: "If a regulatory audit required you to explain an AI-generated metric, could you?",
        options: ["No", "With significant effort", "Mostly yes", "Yes — fully auditable"],
      },
    ],
    remediation: [
      {
        gap: "No AI/agent governance policy",
        action: "Draft a 1-page AI data access policy covering: who can grant agent access, what data is off-limits, and how agent queries are audited.",
      },
      {
        gap: "No approval process for agent access",
        action: "Create a lightweight approval workflow: ticket → review → scoped access grant → monitoring enabled.",
      },
      {
        gap: "Not audit-ready",
        action: "Build an audit trail for every agent query. Regulators will ask. The answer cannot be 'we don't know.'",
      },
    ],
  },
];

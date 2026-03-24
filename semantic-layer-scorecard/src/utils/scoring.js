import { dimensions } from '../data/questions.js';

export const TIERS = {
  STRUCTURALLY_EXPOSED: {
    id: 'structurally_exposed',
    label: 'Structurally Exposed',
    color: '#EF4444',
    bgClass: 'bg-red-500',
    range: [0, 29],
    description:
      'Agents accessing your semantic layer today would produce unreliable, ungoverned outputs. Critical foundational work is needed before any agentic deployment.',
    shareText:
      "Just assessed our semantic layer's AI readiness — we have real work to do before deploying agents on our data. Eye-opening exercise. Try it: tableautodbt.com/scorecard",
  },
  PARTIALLY_GOVERNED: {
    id: 'partially_governed',
    label: 'Partially Governed',
    color: '#F97316',
    bgClass: 'bg-orange-500',
    range: [30, 54],
    description:
      'Foundational elements exist but critical gaps create significant agentic risk. Prioritize access control and lineage before expanding agent access.',
    shareText:
      'Assessed our semantic layer readiness for AI agents — partially governed, with clear gaps to address. Useful benchmark for any data team thinking about agentic BI.',
  },
  GOVERNANCE_AWARE: {
    id: 'governance_aware',
    label: 'Governance Aware',
    color: '#EAB308',
    bgClass: 'bg-yellow-500',
    range: [55, 74],
    description:
      'Strong foundations are in place. Targeted improvements in your weakest dimensions will prepare you for confident agentic deployment.',
    shareText:
      'Our semantic layer scored Governance Aware on the AI readiness scorecard — strong foundations, a few targeted improvements to make. Check yours: tableautodbt.com/scorecard',
  },
  AGENT_READY: {
    id: 'agent_ready',
    label: 'Agent-Ready',
    color: '#10B981',
    bgClass: 'bg-emerald-500',
    range: [75, 90],
    description:
      'Your semantic layer is structurally prepared for agentic access. Focus on maintaining governance rigor as agent usage scales.',
    shareText:
      'Our semantic layer is Agent-Ready according to the AI readiness scorecard. If your team is deploying AI on your data stack, this assessment is worth 5 minutes: tableautodbt.com/scorecard',
  },
};

/**
 * Score a single question answer.
 * Option index 0 = 0 points, index 3 = 3 points.
 * @param {number} optionIndex - 0-based index of selected option
 * @returns {number} score 0-3
 */
export function scoreAnswer(optionIndex) {
  return optionIndex; // 0, 1, 2, or 3
}

/**
 * Calculate per-dimension scores from answers map.
 * @param {Object} answers - { questionId: optionIndex }
 * @returns {Object} { dimId: score } where score is 0-18
 */
export function calculateDimensionScores(answers) {
  const scores = {};
  dimensions.forEach((dim) => {
    let total = 0;
    dim.questions.forEach((q) => {
      const val = answers[q.id];
      if (val !== undefined && val !== null) {
        total += scoreAnswer(val);
      }
    });
    scores[dim.id] = total;
  });
  return scores;
}

/**
 * Calculate total score from answers.
 * @param {Object} answers - { questionId: optionIndex }
 * @returns {number} total score 0-90
 */
export function calculateTotalScore(answers) {
  const dimScores = calculateDimensionScores(answers);
  return Object.values(dimScores).reduce((sum, s) => sum + s, 0);
}

/**
 * Get the tier for a given score.
 * @param {number} score - 0-90
 * @returns {Object} tier object
 */
export function getTier(score) {
  if (score <= 29) return TIERS.STRUCTURALLY_EXPOSED;
  if (score <= 54) return TIERS.PARTIALLY_GOVERNED;
  if (score <= 74) return TIERS.GOVERNANCE_AWARE;
  return TIERS.AGENT_READY;
}

/**
 * Get the percentage score for a dimension (0-100).
 * @param {number} dimScore - 0-18
 * @returns {number} percentage 0-100
 */
export function dimScorePercent(dimScore) {
  return Math.round((dimScore / 18) * 100);
}

/**
 * One-line implication for a dimension score.
 * @param {number} dimId - dimension id 1-5
 * @param {number} score - 0-18
 * @returns {string}
 */
export function getDimImplication(dimId, score) {
  const pct = dimScorePercent(score);
  if (pct < 33) {
    const lowMap = {
      1: 'Metrics lack formal definitions — agents will return inconsistent results.',
      2: 'Access is too broad — agents could touch data they should never see.',
      3: 'No traceable lineage — AI outputs cannot be audited or explained.',
      4: 'Infrastructure cannot safely absorb agent query volumes.',
      5: 'No organizational policy for AI data access — high regulatory risk.',
    };
    return lowMap[dimId] || 'Critical gaps require immediate attention.';
  }
  if (pct < 67) {
    const midMap = {
      1: 'Some metrics defined, but coverage gaps create inconsistent agent behavior.',
      2: 'Partial access controls — some exposure risk remains.',
      3: 'Lineage exists for some paths but blind spots remain.',
      4: 'Basic guardrails present but not designed for agent-scale queries.',
      5: 'Governance policies exist but do not fully cover AI/agent use cases.',
    };
    return midMap[dimId] || 'Foundational elements present — targeted improvements needed.';
  }
  const highMap = {
    1: 'Strong metric definitions — agents have reliable definitions to work from.',
    2: 'Fine-grained access control is in place for agent consumers.',
    3: 'End-to-end lineage enables full auditability of agent outputs.',
    4: 'Infrastructure designed to handle automated, high-frequency queries.',
    5: 'Governance maturity supports confident, auditable agentic deployment.',
  };
  return highMap[dimId] || 'Strong foundation — maintain governance rigor as usage scales.';
}

/**
 * Format answers for radar chart data.
 * @param {Object} dimScores - { dimId: score }
 * @returns {Array} recharts-compatible data array
 */
export function formatRadarData(dimScores) {
  return dimensions.map((dim) => ({
    dimension: dim.shortName,
    score: dimScores[dim.id] || 0,
    fullMark: 18,
  }));
}

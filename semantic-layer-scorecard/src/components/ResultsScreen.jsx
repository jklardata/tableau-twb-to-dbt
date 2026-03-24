import React from 'react';
import ScorecardRadarChart from './RadarChart.jsx';
import DimensionCard from './DimensionCard.jsx';
import { formatRadarData } from '../utils/scoring.js';
import { dimensions } from '../data/questions.js';

export default function ResultsScreen({ results, onGetRoadmap, onRestart }) {
  const { totalScore, tier, dimensionScores } = results;
  const radarData = formatRadarData(dimensionScores);

  function handleLinkedInShare() {
    const text = encodeURIComponent(tier.shareText);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Ftableautodbt.com%2Fscorecard&summary=${text}`, '_blank', 'noopener');
  }

  function handleTwitterShare() {
    const text = encodeURIComponent(tier.shareText);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
  }

  const scorePct = Math.round((totalScore / 90) * 100);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <header
        className="border-b px-4 sm:px-6 py-3 flex items-center gap-3"
        style={{ background: '#ffffff', borderColor: '#e2e8f0' }}
      >
        <a
          href="https://tableautodbt.com"
          className="text-sm font-bold no-underline"
          style={{ color: '#1e293b' }}
        >
          Tableau<span style={{ color: '#0ea5e9' }}>to</span>Dbt
        </a>
        <span style={{ color: '#cbd5e1' }} className="text-xs">·</span>
        <span className="text-xs font-medium" style={{ color: '#64748b' }}>
          Semantic Layer Scorecard
        </span>
        <button
          onClick={onRestart}
          className="ml-auto text-xs px-3 py-1.5 rounded-md transition-colors border"
          style={{ color: '#64748b', background: '#f8fafc', borderColor: '#e2e8f0' }}
        >
          ↩ Restart
        </button>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="fade-in">
          {/* Score hero */}
          <div className="text-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4"
              style={{ background: `${tier.color}15`, color: tier.color, border: `1px solid ${tier.color}30` }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: tier.color }}
              />
              {tier.label}
            </div>

            <div className="text-7xl sm:text-8xl font-black mb-2" style={{ color: tier.color }}>
              {totalScore}
            </div>
            <div className="text-base font-medium mb-4" style={{ color: '#94a3b8' }}>
              out of 90
            </div>

            {/* Score bar */}
            <div
              className="max-w-sm mx-auto h-3 rounded-full mb-6 overflow-hidden"
              style={{ background: '#e2e8f0' }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${scorePct}%`, background: tier.color }}
              />
            </div>

            <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: '#64748b' }}>
              {tier.description}
            </p>
          </div>

          {/* Radar chart */}
          <div
            className="rounded-2xl p-6 border mb-8"
            style={{
              background: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            <h3
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: '#94a3b8' }}
            >
              Dimension Scores
            </h3>
            <ScorecardRadarChart radarData={radarData} tierColor={tier.color} />
          </div>

          {/* Dimension cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            {dimensions.map((dim) => (
              <DimensionCard
                key={dim.id}
                dimId={dim.id}
                score={dimensionScores[dim.id] || 0}
                tierColor={tier.color}
              />
            ))}
          </div>

          {/* CTA section */}
          <div
            className="rounded-2xl p-6 sm:p-8 border text-center mb-6"
            style={{
              background: '#f0f9ff',
              borderColor: '#bae6fd',
            }}
          >
            <div className="text-2xl mb-3">📋</div>
            <h3 className="text-xl font-black mb-2" style={{ color: '#1e293b' }}>
              Get Your Full Remediation Roadmap
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: '#64748b' }}>
              Get a personalized action plan for each of your weak dimensions — specific tools, frameworks,
              and steps to close your governance gaps before deploying agents.
            </p>
            <button
              onClick={onGetRoadmap}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
              style={{ background: '#1e293b' }}
            >
              Get Full Remediation Roadmap →
            </button>
          </div>

          {/* Share section */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <button
              onClick={handleLinkedInShare}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: '#0A66C2', color: '#fff' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              Share on LinkedIn
            </button>

            <button
              onClick={handleTwitterShare}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 border"
              style={{ background: '#000000', color: '#fff', borderColor: '#374151' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.737l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </button>

            <button
              onClick={onRestart}
              className="text-sm px-5 py-2.5 rounded-xl transition-colors border"
              style={{
                color: '#64748b',
                background: '#ffffff',
                borderColor: '#e2e8f0',
              }}
            >
              ↩ Restart Assessment
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

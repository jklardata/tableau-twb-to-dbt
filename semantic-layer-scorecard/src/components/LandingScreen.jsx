import React from 'react';

const DIMENSION_PILLS = [
  { label: 'Metric Definition', icon: '📐' },
  { label: 'Access Control', icon: '🔐' },
  { label: 'Lineage', icon: '🔗' },
  { label: 'Query Tolerance', icon: '⚡' },
  { label: 'Governance', icon: '🏛️' },
];

export default function LandingScreen({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d1b2e' }}>
      {/* Header */}
      <header
        className="border-b border-white/10 px-4 sm:px-6 py-3 flex items-center gap-3"
        style={{ background: 'rgba(13,27,46,0.95)' }}
      >
        <a
          href="https://tableautodbt.com"
          className="text-sm font-bold text-white no-underline flex items-center gap-1"
        >
          Tableau<span style={{ color: '#0ea5e9' }}>to</span>Dbt
        </a>
        <nav className="ml-auto flex items-center gap-1">
          <a
            href="https://tableautodbt.com"
            className="text-xs text-white/50 px-3 py-1.5 rounded-md hover:text-white hover:bg-white/10 transition-colors no-underline"
          >
            Convert
          </a>
          <a
            href="https://tableautodbt.com/diff"
            className="text-xs text-white/50 px-3 py-1.5 rounded-md hover:text-white hover:bg-white/10 transition-colors no-underline"
          >
            Diff
          </a>
          <a
            href="https://tableautodbt.com/docs"
            className="text-xs text-white/50 px-3 py-1.5 rounded-md hover:text-white hover:bg-white/10 transition-colors no-underline"
          >
            Docs
          </a>
          <a
            href="https://tableautodbt.com/audit"
            className="text-xs text-white/50 px-3 py-1.5 rounded-md hover:text-white hover:bg-white/10 transition-colors no-underline"
          >
            Audit
          </a>
          <a
            href="https://tableautodbt.com/scorecard"
            className="text-xs text-white font-semibold px-3 py-1.5 rounded-md no-underline"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}
          >
            Scorecard
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-3xl w-full mx-auto text-center fade-in">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border"
            style={{
              background: 'rgba(99,102,241,0.1)',
              borderColor: 'rgba(99,102,241,0.3)',
              color: '#a5b4fc',
            }}
          >
            <span>🤖</span>
            <span>5-Minute Assessment</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-6 text-white">
            Is Your Semantic Layer{' '}
            <span
              className="inline-block"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #0ea5e9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Ready for AI Agents?
            </span>
          </h1>

          {/* Subhead */}
          <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: '#94a3b8' }}>
            Agentic AI is querying your data stack right now. This 5-minute assessment reveals whether your semantic
            layer has the governance, lineage, and access controls to support it safely.
          </p>

          {/* CTA */}
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-transparent"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%)',
            }}
          >
            Start Assessment
            <span className="text-lg">→</span>
          </button>

          {/* Trust signals */}
          <p className="mt-4 text-xs" style={{ color: '#475569' }}>
            30 questions across 5 dimensions · No account required · Free
          </p>

          {/* Dimension pills */}
          <div className="mt-12 flex flex-wrap gap-2 justify-center">
            {DIMENSION_PILLS.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#94a3b8',
                }}
              >
                <span>{pill.icon}</span>
                {pill.label}
              </span>
            ))}
          </div>

          {/* Visual score teaser */}
          <div
            className="mt-16 rounded-2xl p-6 sm:p-8 border text-left"
            style={{
              background: 'rgba(30,41,59,0.5)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
                  What you'll learn
                </p>
                <ul className="space-y-2">
                  {[
                    'Your overall AI readiness tier (Structurally Exposed → Agent-Ready)',
                    'Per-dimension scores across all 5 governance areas',
                    'Your biggest risk areas and exactly how to address them',
                    'A shareable benchmark to align your data team',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#94a3b8' }}>
                      <span style={{ color: '#6366f1', marginTop: '2px' }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className="rounded-xl px-6 py-4 text-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <div className="text-5xl font-black mb-1" style={{ color: '#6366f1' }}>90</div>
                <div className="text-xs font-medium" style={{ color: '#6366f1' }}>Max Score</div>
                <div className="mt-3 text-xs" style={{ color: '#475569' }}>4 readiness tiers</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-4 py-4 text-center">
        <p className="text-xs" style={{ color: '#475569' }}>
          Built by{' '}
          <a href="https://tableautodbt.com" className="hover:text-white transition-colors no-underline" style={{ color: '#64748b' }}>
            tableautodbt.com
          </a>
          {' '}· No data uploaded to any server
        </p>
      </footer>
    </div>
  );
}

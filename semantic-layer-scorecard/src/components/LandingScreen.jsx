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
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <header
        className="border-b px-4 sm:px-6 py-3 flex items-center gap-3"
        style={{ background: '#ffffff', borderColor: '#e2e8f0' }}
      >
        <a
          href="https://tableautodbt.com"
          className="text-sm font-bold no-underline flex items-center gap-1"
          style={{ color: '#1e293b' }}
        >
          Tableau<span style={{ color: '#0ea5e9' }}>to</span>Dbt
        </a>
        <nav className="ml-auto flex items-center gap-1">
          <a
            href="https://tableautodbt.com"
            className="text-xs px-3 py-1.5 rounded-md transition-colors no-underline"
            style={{ color: '#64748b' }}
            onMouseEnter={e => { e.target.style.color = '#1e293b'; e.target.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.background = 'transparent'; }}
          >
            Convert
          </a>
          <a
            href="https://tableautodbt.com/diff"
            className="text-xs px-3 py-1.5 rounded-md transition-colors no-underline"
            style={{ color: '#64748b' }}
            onMouseEnter={e => { e.target.style.color = '#1e293b'; e.target.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.background = 'transparent'; }}
          >
            Diff
          </a>
          <a
            href="https://tableautodbt.com/docs"
            className="text-xs px-3 py-1.5 rounded-md transition-colors no-underline"
            style={{ color: '#64748b' }}
            onMouseEnter={e => { e.target.style.color = '#1e293b'; e.target.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.background = 'transparent'; }}
          >
            Docs
          </a>
          <a
            href="https://tableautodbt.com/audit"
            className="text-xs px-3 py-1.5 rounded-md transition-colors no-underline"
            style={{ color: '#64748b' }}
            onMouseEnter={e => { e.target.style.color = '#1e293b'; e.target.style.background = '#f1f5f9'; }}
            onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.background = 'transparent'; }}
          >
            Audit
          </a>
          <a
            href="https://tableautodbt.com/scorecard"
            className="text-xs font-semibold px-3 py-1.5 rounded-md no-underline"
            style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
          >
            Scorecard
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-3xl w-full mx-auto text-center fade-in">
          {/* Eyebrow badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border"
            style={{
              background: '#f0f9ff',
              borderColor: '#bae6fd',
              color: '#0369a1',
            }}
          >
            <span>🤖</span>
            <span>5-Minute Assessment</span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-6"
            style={{ color: '#1e293b' }}
          >
            Is Your Semantic Layer{' '}
            <span
              className="inline-block"
              style={{
                background: 'linear-gradient(135deg, #1e293b, #0ea5e9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Ready for AI Agents?
            </span>
          </h1>

          {/* Subhead */}
          <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: '#64748b' }}>
            Agentic AI is querying your data stack right now. This 5-minute assessment reveals whether your semantic
            layer has the governance, lineage, and access controls to support it safely.
          </p>

          {/* CTA */}
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: '#1e293b',
              focusRingColor: '#0ea5e9',
            }}
          >
            Start Assessment
            <span className="text-lg">→</span>
          </button>

          {/* Trust signals */}
          <p className="mt-4 text-xs" style={{ color: '#94a3b8' }}>
            30 questions across 5 dimensions · No account required · Free
          </p>

          {/* Dimension pills */}
          <div className="mt-12 flex flex-wrap gap-2 justify-center">
            {DIMENSION_PILLS.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
                style={{
                  background: '#ffffff',
                  borderColor: '#e2e8f0',
                  color: '#64748b',
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
              background: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="flex-1">
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: '#94a3b8' }}
                >
                  What you'll learn
                </p>
                <ul className="space-y-2">
                  {[
                    'Your overall AI readiness tier (Structurally Exposed → Agent-Ready)',
                    'Per-dimension scores across all 5 governance areas',
                    'Your biggest risk areas and exactly how to address them',
                    'A shareable benchmark to align your data team',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#64748b' }}>
                      <span style={{ color: '#0ea5e9', marginTop: '2px' }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className="rounded-xl px-6 py-4 text-center flex-shrink-0 border"
                style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}
              >
                <div className="text-5xl font-black mb-1" style={{ color: '#0ea5e9' }}>90</div>
                <div className="text-xs font-medium" style={{ color: '#0369a1' }}>Max Score</div>
                <div className="mt-3 text-xs" style={{ color: '#94a3b8' }}>4 readiness tiers</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-4 py-4 text-center" style={{ borderColor: '#e2e8f0' }}>
        <p className="text-xs" style={{ color: '#94a3b8' }}>
          Built by{' '}
          <a
            href="https://tableautodbt.com"
            className="transition-colors no-underline"
            style={{ color: '#64748b' }}
          >
            tableautodbt.com
          </a>
          {' '}· No data uploaded to any server
        </p>
      </footer>
    </div>
  );
}

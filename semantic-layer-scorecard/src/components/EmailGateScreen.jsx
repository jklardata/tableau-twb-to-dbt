import React, { useState, useRef, useCallback } from 'react';
import { dimensions } from '../data/questions.js';
import { dimScorePercent } from '../utils/scoring.js';

const CAPTURE_URL = '/api/scorecard-capture';

export default function EmailGateScreen({ results, onEmailSubmit, emailSubmitted, onRestart }) {
  const { totalScore, tier, dimensionScores } = results;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const reportRef = useRef(null);
  const [linkedInCopied, setLinkedInCopied] = useState(false);

  const handleLinkedInShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tier.shareText);
      setLinkedInCopied(true);
      setTimeout(() => setLinkedInCopied(false), 3000);
    } catch (_) {}
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Ftableautodbt.com%2Fscorecard', '_blank', 'noopener');
  }, [tier.shareText]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError('');

    const payload = {
      name: name.trim(),
      email: email.trim(),
      score: totalScore,
      tier: tier.id,
      dimension_scores: {
        metric_definition: dimensionScores[1] || 0,
        access_control: dimensionScores[2] || 0,
        lineage: dimensionScores[3] || 0,
        query_tolerance: dimensionScores[4] || 0,
        governance: dimensionScores[5] || 0,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(CAPTURE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      onEmailSubmit(tier.id);
    } catch (err) {
      // Still show results even if webhook fails
      console.error('Webhook error:', err);
      onEmailSubmit(tier.id);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadPDF() {
    try {
      const [{ jsPDF }, html2canvas] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const element = reportRef.current;
      if (!element) return;

      const canvas = await html2canvas.default(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;
      const imgHeightInPdf = pdfWidth / ratio;

      if (imgHeightInPdf <= pdfHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightInPdf);
      } else {
        // Multi-page
        let remainingHeight = imgHeightInPdf;
        let position = 0;
        while (remainingHeight > 0) {
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightInPdf);
          remainingHeight -= pdfHeight;
          position -= pdfHeight;
          if (remainingHeight > 0) pdf.addPage();
        }
      }

      pdf.save(`semantic-layer-scorecard-${tier.id}-${totalScore}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
    }
  }

  // Sort dimensions by score ascending (weakest first)
  const sortedDims = [...dimensions].sort(
    (a, b) => (dimensionScores[a.id] || 0) - (dimensionScores[b.id] || 0)
  );

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

      <main className="flex-1 px-4 sm:px-6 py-10 max-w-3xl mx-auto w-full">
        {!emailSubmitted ? (
          /* Email gate form */
          <div className="fade-in">
            <div className="text-center mb-8">
              <div className="text-4xl mb-4">📊</div>
              <h2 className="text-2xl sm:text-3xl font-black mb-3" style={{ color: '#1e293b' }}>
                Get Your Personalized Remediation Roadmap
              </h2>
              <p className="text-sm leading-relaxed max-w-xl mx-auto" style={{ color: '#64748b' }}>
                Enter your name and email to unlock the full per-dimension action plan with specific
                tools, frameworks, and prioritized steps to close your governance gaps.
              </p>
            </div>

            {/* Score recap */}
            <div
              className="rounded-2xl p-5 border mb-8 flex flex-col sm:flex-row items-center gap-4"
              style={{
                background: '#ffffff',
                borderColor: '#e2e8f0',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}
            >
              <div className="text-center sm:text-left">
                <div
                  className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ color: '#94a3b8' }}
                >
                  Your Score
                </div>
                <div className="text-4xl font-black" style={{ color: tier.color }}>
                  {totalScore}<span className="text-lg font-normal" style={{ color: '#94a3b8' }}>/90</span>
                </div>
              </div>
              <div className="h-px w-full sm:h-12 sm:w-px" style={{ background: '#e2e8f0' }} />
              <div className="text-center sm:text-left">
                <div
                  className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ color: '#94a3b8' }}
                >
                  Tier
                </div>
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold"
                  style={{ background: `${tier.color}15`, color: tier.color, border: `1px solid ${tier.color}30` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: tier.color }} />
                  {tier.label}
                </div>
              </div>
              <div className="h-px w-full sm:h-12 sm:w-px" style={{ background: '#e2e8f0' }} />
              <div className="flex-1 text-center sm:text-left">
                <div
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: '#94a3b8' }}
                >
                  Weakest Dimensions
                </div>
                <div className="flex flex-wrap gap-1 justify-center sm:justify-start">
                  {sortedDims.slice(0, 2).map((dim) => (
                    <span
                      key={dim.id}
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                      }}
                    >
                      {dim.icon} {dim.shortName}: {dimensionScores[dim.id]}/18
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl p-6 sm:p-8 border"
              style={{
                background: '#ffffff',
                borderColor: '#e2e8f0',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label
                    className="block text-xs font-semibold mb-2 uppercase tracking-wide"
                    style={{ color: '#64748b' }}
                  >
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#1e293b',
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-2 uppercase tracking-wide"
                    style={{ color: '#64748b' }}
                  >
                    Work Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    required
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#1e293b',
                    }}
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 mb-4">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !name.trim() || !email.trim()}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ background: '#1e293b' }}
              >
                {submitting ? 'Sending...' : 'Send My Roadmap →'}
              </button>

              <p className="text-xs text-center mt-3" style={{ color: '#94a3b8' }}>
                No spam. Unsubscribe anytime. Your data stays with tableautodbt.com.
              </p>
            </form>
          </div>
        ) : (
          /* Full remediation report */
          <div className="fade-in">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-2xl sm:text-3xl font-black mb-2" style={{ color: '#1e293b' }}>
                Your Remediation Roadmap
              </h2>
              <p className="text-sm" style={{ color: '#94a3b8' }}>
                Prioritized by your weakest dimensions first
              </p>
            </div>

            {/* PDF-exportable report */}
            <div ref={reportRef} style={{ background: '#f8fafc', padding: '8px' }}>
              {/* Report header */}
              <div
                className="rounded-2xl p-5 border mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
                style={{
                  background: '#ffffff',
                  borderColor: '#e2e8f0',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <div>
                  <div
                    className="text-xs font-semibold uppercase tracking-widest mb-1"
                    style={{ color: '#94a3b8' }}
                  >
                    Semantic Layer Readiness Scorecard
                  </div>
                  <div className="text-3xl font-black" style={{ color: tier.color }}>
                    {totalScore} / 90
                  </div>
                </div>
                <div className="flex-1" />
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: `${tier.color}15`, color: tier.color, border: `1px solid ${tier.color}30` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: tier.color }} />
                  {tier.label}
                </div>
              </div>

              {/* Per-dimension remediation — sorted weakest first */}
              {sortedDims.map((dim) => {
                const dimScore = dimensionScores[dim.id] || 0;
                const pct = dimScorePercent(dimScore);
                let barColor = '#10B981';
                if (pct < 33) barColor = '#EF4444';
                else if (pct < 67) barColor = '#F97316';
                else if (pct < 85) barColor = '#EAB308';

                return (
                  <div
                    key={dim.id}
                    className="rounded-2xl p-5 sm:p-6 border mb-4"
                    style={{
                      background: '#ffffff',
                      borderColor: '#e2e8f0',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Dimension header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{dim.icon}</span>
                        <div>
                          <div className="text-sm font-bold" style={{ color: '#1e293b' }}>{dim.name}</div>
                          <div className="text-xs" style={{ color: '#94a3b8' }}>{dim.description}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="text-xl font-black" style={{ color: barColor }}>
                          {dimScore}
                        </div>
                        <div className="text-xs" style={{ color: '#94a3b8' }}>/18</div>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="h-2 rounded-full mb-4" style={{ background: '#e2e8f0' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: barColor }}
                      />
                    </div>

                    {/* Remediation items */}
                    {pct < 85 ? (
                      <div className="space-y-3">
                        <div
                          className="text-xs font-semibold uppercase tracking-wide mb-2"
                          style={{ color: '#94a3b8' }}
                        >
                          Action Items
                        </div>
                        {dim.remediation.map((item, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl p-4 border"
                            style={{
                              background: '#fffbeb',
                              borderColor: '#fde68a',
                            }}
                          >
                            <div
                              className="text-xs font-semibold mb-1.5 flex items-center gap-2"
                              style={{ color: '#d97706' }}
                            >
                              <span>⚠</span>
                              Gap: {item.gap}
                            </div>
                            <div className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
                              <span className="font-semibold" style={{ color: '#059669' }}>Action: </span>
                              {item.action}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="rounded-xl p-4 border flex items-center gap-3"
                        style={{
                          background: '#f0fdf4',
                          borderColor: '#bbf7d0',
                        }}
                      >
                        <span className="text-emerald-500 text-lg">✓</span>
                        <p className="text-xs" style={{ color: '#059669' }}>
                          Strong score in this dimension. Focus on maintaining governance rigor as
                          agent usage scales.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Footer in report */}
              <div
                className="rounded-xl p-4 text-center border"
                style={{
                  background: '#ffffff',
                  borderColor: '#e2e8f0',
                }}
              >
                <p className="text-xs" style={{ color: '#94a3b8' }}>
                  Generated by{' '}
                  <span style={{ color: '#0ea5e9' }}>tableautodbt.com/scorecard</span>
                  {' '}· Semantic Layer AI Readiness Scorecard
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
              <button
                onClick={handleDownloadPDF}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: '#1e293b' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Report
              </button>

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={handleLinkedInShare}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105"
                  style={{ background: '#0A66C2', color: '#fff' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  {linkedInCopied ? 'Text copied! Paste in LinkedIn →' : 'Share on LinkedIn'}
                </button>
                {linkedInCopied && (
                  <p className="text-xs" style={{ color: '#64748b' }}>Share text copied to clipboard</p>
                )}
              </div>

              <button
                onClick={onRestart}
                className="text-sm px-5 py-3 rounded-xl transition-colors border"
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
        )}
      </main>
    </div>
  );
}

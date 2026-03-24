import React from 'react';
import { getDimImplication, dimScorePercent } from '../utils/scoring.js';
import { dimensions } from '../data/questions.js';

export default function DimensionCard({ dimId, score, tierColor, compact = false }) {
  const dim = dimensions.find((d) => d.id === dimId);
  if (!dim) return null;

  const pct = dimScorePercent(score);
  const implication = getDimImplication(dimId, score);

  // Color based on score percentage
  let barColor = '#10B981';
  if (pct < 33) barColor = '#EF4444';
  else if (pct < 67) barColor = '#F97316';
  else if (pct < 85) barColor = '#EAB308';

  if (compact) {
    return (
      <div
        className="rounded-xl p-4 border"
        style={{
          background: 'rgba(30,41,59,0.5)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{dim.icon}</span>
            <span className="text-xs font-semibold text-white">{dim.shortName}</span>
          </div>
          <span className="text-sm font-bold" style={{ color: barColor }}>
            {score}/18
          </span>
        </div>
        {/* Score bar */}
        <div className="h-1.5 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <p className="text-xs leading-snug" style={{ color: '#64748b' }}>
          {implication}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: 'rgba(30,41,59,0.5)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{dim.icon}</span>
          <div>
            <div className="text-sm font-bold text-white">{dim.name}</div>
            <div className="text-xs" style={{ color: '#64748b' }}>
              {dim.description}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <div className="text-xl font-black" style={{ color: barColor }}>
            {score}
          </div>
          <div className="text-xs" style={{ color: '#475569' }}>/18</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
        {implication}
      </p>
    </div>
  );
}

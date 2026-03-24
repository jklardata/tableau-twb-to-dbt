import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { dimensions } from '../data/questions.js';

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="rounded-lg px-3 py-2 text-sm"
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#e2e8f0',
        }}
      >
        <div className="font-semibold">{data.dimension}</div>
        <div style={{ color: '#94a3b8' }}>
          {data.score} / {data.fullMark}
        </div>
      </div>
    );
  }
  return null;
}

export default function ScorecardRadarChart({ radarData, tierColor }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid
          stroke="rgba(255,255,255,0.1)"
          gridType="polygon"
        />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Radar
          name="Score"
          dataKey="score"
          stroke={tierColor || '#6366f1'}
          fill={tierColor || '#6366f1'}
          fillOpacity={0.2}
          strokeWidth={2}
          dot={{ fill: tierColor || '#6366f1', strokeWidth: 0, r: 4 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

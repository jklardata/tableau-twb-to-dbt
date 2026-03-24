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
        className="rounded-lg px-3 py-2 text-sm border"
        style={{
          background: '#ffffff',
          borderColor: '#e2e8f0',
          color: '#1e293b',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <div className="font-semibold">{data.dimension}</div>
        <div style={{ color: '#64748b' }}>
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
          stroke="#e2e8f0"
          gridType="polygon"
        />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Radar
          name="Score"
          dataKey="score"
          stroke={tierColor || '#0ea5e9'}
          fill={tierColor || '#0ea5e9'}
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ fill: tierColor || '#0ea5e9', strokeWidth: 0, r: 4 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

import React, { useState, useEffect } from 'react';
import { dimensions } from '../data/questions.js';

export default function CalculatingScreen({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [completedDims, setCompletedDims] = useState([]);

  useEffect(() => {
    const totalMs = 2500;
    const dimInterval = totalMs / dimensions.length;
    const progressInterval = 30;

    // Increment progress bar
    const progressTimer = setInterval(() => {
      setProgress((p) => {
        const next = p + (progressInterval / totalMs) * 100;
        return Math.min(next, 100);
      });
    }, progressInterval);

    // Show dimension checkmarks one by one
    dimensions.forEach((_, i) => {
      setTimeout(() => {
        setCompletedDims((prev) => [...prev, i]);
      }, dimInterval * (i + 0.5));
    });

    // Complete
    const doneTimer = setTimeout(() => {
      clearInterval(progressTimer);
      setProgress(100);
      setTimeout(onDone, 300);
    }, totalMs);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#0d1b2e' }}
    >
      <div className="max-w-md w-full text-center fade-in">
        {/* Animated icon */}
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-8 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(14,165,233,0.2))',
            border: '1px solid rgba(99,102,241,0.3)',
          }}
        >
          <span className="text-3xl">🔍</span>
        </div>

        <h2 className="text-2xl font-black text-white mb-2">Analyzing your responses...</h2>
        <p className="text-sm mb-8" style={{ color: '#64748b' }}>
          Scoring across 5 governance dimensions
        </p>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full mb-8 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full progress-fill"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #0ea5e9)',
            }}
          />
        </div>

        {/* Dimension checklist */}
        <div
          className="rounded-2xl p-6 text-left space-y-3"
          style={{
            background: 'rgba(30,41,59,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {dimensions.map((dim, i) => {
            const isDone = completedDims.includes(i);
            return (
              <div key={dim.id} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={{
                    background: isDone ? '#10B981' : 'rgba(255,255,255,0.06)',
                    border: isDone ? 'none' : '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {isDone ? (
                    <span className="text-white text-xs font-bold check-pop">✓</span>
                  ) : (
                    <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
                  )}
                </div>
                <span
                  className="text-sm font-medium transition-colors duration-300"
                  style={{ color: isDone ? '#e2e8f0' : '#475569' }}
                >
                  {dim.icon} {dim.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

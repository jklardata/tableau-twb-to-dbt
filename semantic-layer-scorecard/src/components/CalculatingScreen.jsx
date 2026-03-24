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
      style={{ background: '#f8fafc' }}
    >
      <div className="max-w-md w-full text-center fade-in">
        {/* Animated icon */}
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-8 flex items-center justify-center border"
          style={{
            background: '#f0f9ff',
            borderColor: '#bae6fd',
          }}
        >
          <span className="text-3xl">🔍</span>
        </div>

        <h2 className="text-2xl font-black mb-2" style={{ color: '#1e293b' }}>
          Analyzing your responses...
        </h2>
        <p className="text-sm mb-8" style={{ color: '#64748b' }}>
          Scoring across 5 governance dimensions
        </p>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full mb-8 overflow-hidden"
          style={{ background: '#e2e8f0' }}
        >
          <div
            className="h-full rounded-full progress-fill"
            style={{
              width: `${progress}%`,
              background: '#0ea5e9',
            }}
          />
        </div>

        {/* Dimension checklist */}
        <div
          className="rounded-2xl p-6 text-left space-y-3 border"
          style={{
            background: '#ffffff',
            borderColor: '#e2e8f0',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {dimensions.map((dim, i) => {
            const isDone = completedDims.includes(i);
            return (
              <div key={dim.id} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={{
                    background: isDone ? '#10B981' : '#f1f5f9',
                    border: isDone ? 'none' : '1px solid #e2e8f0',
                  }}
                >
                  {isDone ? (
                    <span className="text-white text-xs font-bold check-pop">✓</span>
                  ) : (
                    <span className="w-2 h-2 rounded-full" style={{ background: '#cbd5e1' }} />
                  )}
                </div>
                <span
                  className="text-sm font-medium transition-colors duration-300"
                  style={{ color: isDone ? '#1e293b' : '#94a3b8' }}
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

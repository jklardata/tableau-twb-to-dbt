import React, { useState, useEffect } from 'react';
import { dimensions } from '../data/questions.js';

export default function AssessmentScreen({ answers, setAnswers, onComplete, onDimensionComplete }) {
  const [currentDimIndex, setCurrentDimIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  const currentDim = dimensions[currentDimIndex];
  const totalDimensions = dimensions.length;

  // Check if all questions in current dimension are answered
  const currentDimAnswered = currentDim.questions.every(
    (q) => answers[q.id] !== undefined && answers[q.id] !== null
  );

  function handleOptionSelect(questionId, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  function handleNext() {
    if (!currentDimAnswered) return;
    onDimensionComplete(currentDimIndex);

    if (currentDimIndex < totalDimensions - 1) {
      setFadeKey((k) => k + 1);
      setCurrentDimIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onComplete(answers);
    }
  }

  function handleBack() {
    if (currentDimIndex > 0) {
      setFadeKey((k) => k + 1);
      setCurrentDimIndex((i) => i - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const progressPct = ((currentDimIndex) / totalDimensions) * 100;
  const isLastDimension = currentDimIndex === totalDimensions - 1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d1b2e' }}>
      {/* Header */}
      <header
        className="border-b border-white/10 px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: 'rgba(13,27,46,0.97)', backdropFilter: 'blur(8px)' }}
      >
        <a
          href="https://tableautodbt.com"
          className="text-sm font-bold text-white no-underline"
        >
          Tableau<span style={{ color: '#0ea5e9' }}>to</span>Dbt
        </a>
        <span className="text-white/20 text-xs">·</span>
        <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>
          Semantic Layer Scorecard
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: '#64748b' }}>
            Dimension {currentDimIndex + 1} of {totalDimensions}
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full progress-fill"
          style={{
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #6366f1, #0ea5e9)',
          }}
        />
      </div>

      {/* Content */}
      <main className="flex-1 px-4 sm:px-6 py-8 sm:py-12 max-w-3xl mx-auto w-full">
        <div key={fadeKey} className="fade-in">
          {/* Dimension header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <span
                className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded"
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99,102,241,0.25)',
                }}
              >
                Dimension {currentDimIndex + 1} of {totalDimensions}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
              {currentDim.icon} {currentDim.name}
            </h2>
            <p className="text-sm sm:text-base" style={{ color: '#94a3b8' }}>
              {currentDim.description}
            </p>

            {/* Mini progress dots */}
            <div className="flex gap-1.5 mt-4">
              {dimensions.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full flex-1"
                  style={{
                    background:
                      i < currentDimIndex
                        ? '#6366f1'
                        : i === currentDimIndex
                        ? '#a5b4fc'
                        : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-6">
            {currentDim.questions.map((question, qIdx) => {
              const selectedOption = answers[question.id];
              return (
                <div key={question.id}>
                  <p className="text-sm font-semibold mb-3 leading-relaxed text-white">
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-2 flex-shrink-0"
                      style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}
                    >
                      {qIdx + 1}
                    </span>
                    {question.text}
                  </p>
                  <div className="grid gap-2">
                    {question.options.map((option, optIdx) => {
                      const isSelected = selectedOption === optIdx;
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleOptionSelect(question.id, optIdx)}
                          className={`option-card w-full text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-transparent ${
                            isSelected ? 'selected' : ''
                          }`}
                          style={{
                            background: isSelected
                              ? 'rgba(99,102,241,0.12)'
                              : 'rgba(30,41,59,0.5)',
                            borderColor: isSelected
                              ? '#6366f1'
                              : 'rgba(255,255,255,0.08)',
                            color: isSelected ? '#e2e8f0' : '#94a3b8',
                          }}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                              style={{
                                borderColor: isSelected ? '#6366f1' : 'rgba(255,255,255,0.2)',
                                background: isSelected ? '#6366f1' : 'transparent',
                              }}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-white" />
                              )}
                            </span>
                            {option}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
            <button
              onClick={handleBack}
              disabled={currentDimIndex === 0}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: currentDimIndex === 0 ? '#334155' : '#94a3b8',
                cursor: currentDimIndex === 0 ? 'not-allowed' : 'pointer',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              ← Back
            </button>

            <div className="text-xs" style={{ color: '#475569' }}>
              {currentDim.questions.filter((q) => answers[q.id] !== undefined).length} / {currentDim.questions.length} answered
            </div>

            <button
              onClick={handleNext}
              disabled={!currentDimAnswered}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                background: currentDimAnswered
                  ? 'linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%)'
                  : 'rgba(99,102,241,0.2)',
                cursor: currentDimAnswered ? 'pointer' : 'not-allowed',
                color: currentDimAnswered ? '#fff' : '#475569',
                opacity: currentDimAnswered ? 1 : 0.6,
              }}
            >
              {isLastDimension ? 'See Results →' : 'Next →'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

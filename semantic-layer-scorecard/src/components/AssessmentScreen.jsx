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
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <header
        className="border-b px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: '#ffffff', borderColor: '#e2e8f0', backdropFilter: 'blur(8px)' }}
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>
            Dimension {currentDimIndex + 1} of {totalDimensions}
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: '#e2e8f0' }}>
        <div
          className="h-full progress-fill"
          style={{
            width: `${progressPct}%`,
            background: '#0ea5e9',
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
                  background: '#f0f9ff',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                }}
              >
                Dimension {currentDimIndex + 1} of {totalDimensions}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-2" style={{ color: '#1e293b' }}>
              {currentDim.icon} {currentDim.name}
            </h2>
            <p className="text-sm sm:text-base" style={{ color: '#64748b' }}>
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
                        ? '#0ea5e9'
                        : i === currentDimIndex
                        ? '#7dd3fc'
                        : '#e2e8f0',
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
                  <p
                    className="text-sm font-semibold mb-3 leading-relaxed"
                    style={{ color: '#1e293b' }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-2 flex-shrink-0"
                      style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
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
                          className={`option-card w-full text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 ${
                            isSelected ? 'selected' : ''
                          }`}
                          style={{
                            background: isSelected ? '#f0f9ff' : '#ffffff',
                            borderColor: isSelected ? '#0ea5e9' : '#e2e8f0',
                            color: isSelected ? '#0c4a6e' : '#64748b',
                            boxShadow: isSelected ? '0 0 0 1px #0ea5e9' : 'none',
                          }}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                              style={{
                                borderColor: isSelected ? '#0ea5e9' : '#cbd5e1',
                                background: isSelected ? '#0ea5e9' : 'transparent',
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
          <div
            className="flex items-center justify-between mt-10 pt-6 border-t"
            style={{ borderColor: '#e2e8f0' }}
          >
            <button
              onClick={handleBack}
              disabled={currentDimIndex === 0}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none border"
              style={{
                background: '#ffffff',
                color: currentDimIndex === 0 ? '#cbd5e1' : '#64748b',
                cursor: currentDimIndex === 0 ? 'not-allowed' : 'pointer',
                borderColor: '#e2e8f0',
              }}
            >
              ← Back
            </button>

            <div className="text-xs" style={{ color: '#94a3b8' }}>
              {currentDim.questions.filter((q) => answers[q.id] !== undefined).length} / {currentDim.questions.length} answered
            </div>

            <button
              onClick={handleNext}
              disabled={!currentDimAnswered}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all focus:outline-none focus:ring-2 focus:ring-sky-400"
              style={{
                background: currentDimAnswered ? '#1e293b' : '#cbd5e1',
                cursor: currentDimAnswered ? 'pointer' : 'not-allowed',
                color: currentDimAnswered ? '#fff' : '#94a3b8',
                opacity: currentDimAnswered ? 1 : 0.7,
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

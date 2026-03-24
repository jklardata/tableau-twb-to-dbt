import React, { useState } from 'react';
import LandingScreen from './components/LandingScreen.jsx';
import AssessmentScreen from './components/AssessmentScreen.jsx';
import CalculatingScreen from './components/CalculatingScreen.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import EmailGateScreen from './components/EmailGateScreen.jsx';
import { calculateDimensionScores, calculateTotalScore, getTier } from './utils/scoring.js';

const SCREENS = {
  LANDING: 'landing',
  ASSESSMENT: 'assessment',
  CALCULATING: 'calculating',
  RESULTS: 'results',
  EMAIL_GATE: 'email_gate',
};

function pushDataLayer(event, data = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.LANDING);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  function handleStartAssessment() {
    pushDataLayer('assessment_started');
    setScreen(SCREENS.ASSESSMENT);
  }

  function handleDimensionComplete(dimIndex) {
    pushDataLayer('dimension_completed', { dimension: dimIndex + 1 });
  }

  function handleAssessmentComplete(finalAnswers) {
    setAnswers(finalAnswers);
    setScreen(SCREENS.CALCULATING);
  }

  function handleCalculatingDone() {
    const dimScores = calculateDimensionScores(answers);
    const totalScore = calculateTotalScore(answers);
    const tier = getTier(totalScore);

    const computedResults = {
      totalScore,
      tier,
      dimensionScores: dimScores,
    };

    setResults(computedResults);
    setScreen(SCREENS.RESULTS);

    pushDataLayer('results_viewed', {
      score: totalScore,
      tier: tier.id,
    });
  }

  function handleGetRoadmap() {
    setScreen(SCREENS.EMAIL_GATE);
  }

  function handleEmailSubmit(tier) {
    pushDataLayer('email_submitted', { tier });
    setEmailSubmitted(true);
  }

  function handleRestart() {
    setAnswers({});
    setResults(null);
    setEmailSubmitted(false);
    setScreen(SCREENS.LANDING);
  }

  return (
    <div className="min-h-screen" style={{ background: '#0d1b2e' }}>
      {screen === SCREENS.LANDING && (
        <LandingScreen onStart={handleStartAssessment} />
      )}
      {screen === SCREENS.ASSESSMENT && (
        <AssessmentScreen
          answers={answers}
          setAnswers={setAnswers}
          onComplete={handleAssessmentComplete}
          onDimensionComplete={handleDimensionComplete}
        />
      )}
      {screen === SCREENS.CALCULATING && (
        <CalculatingScreen onDone={handleCalculatingDone} />
      )}
      {screen === SCREENS.RESULTS && results && (
        <ResultsScreen
          results={results}
          onGetRoadmap={handleGetRoadmap}
          onRestart={handleRestart}
        />
      )}
      {screen === SCREENS.EMAIL_GATE && results && (
        <EmailGateScreen
          results={results}
          onEmailSubmit={handleEmailSubmit}
          emailSubmitted={emailSubmitted}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

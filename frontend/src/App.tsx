import { useState } from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';
import AssessmentScreen from './components/AssessmentScreen';
import AuthDialog from './components/AuthDialog';
import ResultsScreen from './components/ResultsScreen';
import ReviewScreen from './components/ReviewScreen';
import StartScreen from './components/StartScreen';
import SubmitDialog from './components/SubmitDialog';
import TopNav from './components/TopNav';
import { useAssessment } from './hooks/useAssessment';

export default function App() {
  const [authOpen, setAuthOpen] = useState(false);
  const { state, actions } = useAssessment();
  const active = state.screen === 'assessment' || state.screen === 'review' || state.screen === 'submitting';
  const unanswered = state.questions.length - state.answered;

  return (
    <div className="app">
      <TopNav
        onOpenAuth={() => setAuthOpen(true)}
        compact={state.screen !== 'start'}
        showTimer={active && Boolean(state.settings?.timerSeconds)}
        timeRemaining={state.timeRemaining}
      />

      {state.screen === 'start' && (
        <StartScreen
          selectedMode={state.selectedMode}
          setSelectedMode={actions.setSelectedMode}
          custom={state.custom}
          setCustom={actions.setCustom}
          onStart={(input) => void actions.start(input)}
          loading={false}
          resume={state.resumeSnapshot}
          onResume={actions.resume}
          onDiscard={actions.discardResume}
          onOpenAuth={() => setAuthOpen(true)}
        />
      )}

      {state.screen === 'loading' && (
        <main className="loading-screen"><LoaderCircle className="spin" size={30} /><h1>Building a balanced session</h1><p>Sampling across competencies and question formats…</p></main>
      )}

      {state.screen === 'assessment' && state.currentQuestion && state.settings && (
        <AssessmentScreen
          question={state.currentQuestion}
          response={state.responses[state.currentQuestion.itemId]}
          settings={state.settings}
          index={state.currentIndex}
          total={state.questions.length}
          flagged={Boolean(state.flagged[state.currentQuestion.itemId])}
          hint={state.hint}
          hintLoading={state.hintLoading}
          onPick={actions.pick}
          onBack={actions.back}
          onNext={actions.next}
          onFlag={actions.toggleFlag}
          onReview={actions.goReview}
          onExit={actions.exit}
          onHint={() => void actions.requestHint()}
        />
      )}

      {state.screen === 'review' && (
        <ReviewScreen
          questions={state.questions}
          responses={state.responses}
          flagged={state.flagged}
          onJump={actions.jumpTo}
          onBack={actions.goAssessment}
          onSubmit={actions.openSubmit}
        />
      )}

      {state.screen === 'submitting' && (
        <main className="loading-screen"><LoaderCircle className="spin" size={30} /><h1>Scoring your responses</h1><p>Work-style tendencies and scenario judgment stay separate.</p></main>
      )}

      {state.screen === 'results' && state.result && (
        <ResultsScreen
          result={state.result}
          sessionToken={state.sessionToken}
          responses={Object.values(state.responses)}
          questions={state.questions}
          flaggedItemIds={state.questions.filter((question) => state.flagged[question.itemId]).map((question) => question.itemId)}
          onRestart={actions.restart}
          onRetryFlagged={actions.retryFlagged}
          onPracticeFocus={actions.retryItems}
          onOpenAuth={() => setAuthOpen(true)}
        />
      )}

      {state.showSubmit && (
        <SubmitDialog unanswered={unanswered} total={state.questions.length} onCancel={actions.closeSubmit} onConfirm={() => void actions.submit()} />
      )}

      {state.error && (
        <div className="toast" role="alert"><AlertCircle size={18} /><span>{state.error}</span><button type="button" onClick={actions.clearError} aria-label="Dismiss error"><X size={17} /></button></div>
      )}

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

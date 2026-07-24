import {
  ArrowLeft, ArrowRight, Brain, CheckCircle2, Flag, Grid3X3, Lightbulb, LogOut,
} from 'lucide-react';
import { isResponseValid } from '../lib/assessment';
import type { AssessmentResponse, CandidateQuestion, Hint, OptionLetter, SessionSettings } from '../types';
import FirstSecondQuestion from './questions/FirstSecondQuestion';
import MostLeastQuestion from './questions/MostLeastQuestion';
import SjtQuestion from './questions/SjtQuestion';
import ModelThinking from './ModelThinking';

type Props = {
  question: CandidateQuestion;
  response?: AssessmentResponse;
  settings: SessionSettings;
  index: number;
  total: number;
  flagged: boolean;
  hint?: Hint;
  hintLoading: boolean;
  onPick: (slot: 'mostResponse' | 'leastResponse' | 'secondResponse', letter: OptionLetter) => void;
  onBack: () => void;
  onNext: () => void;
  onFlag: () => void;
  onReview: () => void;
  onExit: () => void;
  onHint: () => void;
};

export default function AssessmentScreen(props: Props) {
  const { question, response, settings, index, total, flagged, hint, hintLoading } = props;
  const valid = isResponseValid(question, response);
  const isScenario = question.responseMode === 'sjt_best_worst_4';
  const validation = question.responseMode === 'first_second_3'
    ? 'Choose one first choice and one different second choice.'
    : `Choose one ${isScenario ? 'most likely' : 'most like you'} and one ${isScenario ? 'least likely' : 'least like you'}.`;

  return (
    <main className="assessment-page">
      <div className="assessment-progress shell shell--assessment">
        <span><strong>{index + 1}</strong> of {total}</span>
        <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Assessment progress">
          <div style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <button className="text-button" type="button" onClick={props.onExit}><LogOut size={15} /> Exit</button>
      </div>

      <section className="question-shell shell shell--assessment" aria-labelledby="question-heading">
        <div className="question-meta">
          <span className={`type-pill${isScenario ? ' type-pill--scenario' : ''}`}>
            {isScenario && <Brain size={14} />}{question.itemType}
          </span>
          {flagged && <span className="flag-label"><Flag size={14} fill="currentColor" /> Flagged</span>}
        </div>

        <p className="question-instruction">{question.instruction}</p>
        {isScenario ? (
          <div className="scenario-panel"><span>Scenario</span><h1 id="question-heading">{question.stem}</h1></div>
        ) : (
          <h1 id="question-heading" className="question-stem">{question.stem}</h1>
        )}

        {question.responseMode === 'most_least_3' && <MostLeastQuestion question={question} response={response} onPick={props.onPick} />}
        {question.responseMode === 'first_second_3' && <FirstSecondQuestion question={question} response={response} onPick={props.onPick} />}
        {question.responseMode === 'sjt_best_worst_4' && <SjtQuestion question={question} response={response} onPick={props.onPick} />}

        <div className="response-status" aria-live="polite">
          {valid
            ? <span className="response-status__saved"><CheckCircle2 size={16} /> Response saved{settings.feedbackTiming === 'immediate' ? '. Stay with your usual behaviour.' : '.'}</span>
            : <span>{validation}</span>}
        </div>

        {settings.assistanceEnabled && (
          <div className="hint-area">
            {!hint && !hintLoading && (
              <button className="button button--hint" type="button" onClick={props.onHint}>
                <Lightbulb size={17} /> Give me a thinking hint
              </button>
            )}
            {hintLoading && <ModelThinking context="hint" />}
            {hint && (
              <aside className="hint-card" aria-live="polite">
                <div className="hint-card__icon"><Lightbulb size={19} /></div>
                <div className="hint-card__content">
                  <strong>{hint.title}</strong>
                  <p>{hint.guidance}</p>
                  <div className="hint-card__signals">
                    <div className="hint-signal hint-signal--strong"><span>What a strong answer shows</span><p>{hint.strongAnswer}</p></div>
                    <div className="hint-signal hint-signal--weak"><span>What a weak answer risks</span><p>{hint.weakAnswer}</p></div>
                  </div>
                  <p className="hint-card__reflection">Think about it: {hint.reflectionQuestion}</p>
                </div>
              </aside>
            )}
          </div>
        )}

        <footer className="question-toolbar">
          <button className="button button--secondary" type="button" onClick={props.onBack} disabled={index === 0}><ArrowLeft size={17} /> Back</button>
          <button className={`button button--secondary${flagged ? ' is-flagged' : ''}`} type="button" onClick={props.onFlag}><Flag size={16} fill={flagged ? 'currentColor' : 'none'} /> {flagged ? 'Flagged' : 'Flag'}</button>
          <button className="button button--secondary review-button" type="button" onClick={props.onReview}><Grid3X3 size={16} /> Review</button>
          <button className="button button--primary question-toolbar__next" type="button" onClick={props.onNext} disabled={!valid}>{index === total - 1 ? 'Review answers' : 'Next'} <ArrowRight size={17} /></button>
        </footer>
      </section>
    </main>
  );
}

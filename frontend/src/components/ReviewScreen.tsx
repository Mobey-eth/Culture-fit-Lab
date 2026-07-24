import { ArrowLeft, ArrowRight, Check, Flag, Minus } from 'lucide-react';
import { isResponseValid } from '../lib/assessment';
import type { AssessmentResponse, CandidateQuestion } from '../types';

type Props = {
  questions: CandidateQuestion[];
  responses: Record<string, AssessmentResponse>;
  flagged: Record<string, boolean>;
  onJump: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
};

export default function ReviewScreen({ questions, responses, flagged, onJump, onBack, onSubmit }: Props) {
  const cells = questions.map((question, index) => ({
    index, answered: isResponseValid(question, responses[question.itemId]), flagged: Boolean(flagged[question.itemId]),
  }));
  const answered = cells.filter((cell) => cell.answered).length;
  const flaggedCount = cells.filter((cell) => cell.flagged).length;
  const unanswered = questions.length - answered;

  return (
    <main className="review-page shell shell--assessment">
      <p className="eyebrow">Before you submit</p>
      <div className="review-heading">
        <div><h1>Review your responses</h1><p>{answered} answered · {unanswered} unanswered · {flaggedCount} flagged</p></div>
        <button className="button button--secondary" type="button" onClick={onBack}><ArrowLeft size={17} /> Keep answering</button>
      </div>

      <div className="review-summary">
        <span><i className="review-key review-key--answered"><Check size={12} /></i> Answered</span>
        <span><i className="review-key"><Minus size={12} /></i> Unanswered</span>
        <span><i className="review-key review-key--flagged"><Flag size={11} /></i> Flagged</span>
      </div>

      <div className="review-grid" aria-label="Question review grid">
        {cells.map((cell) => (
          <button
            key={cell.index} type="button" onClick={() => onJump(cell.index)}
            className={`${cell.answered ? 'is-answered' : ''}${cell.flagged ? ' is-flagged' : ''}`}
            aria-label={`Question ${cell.index + 1}: ${cell.answered ? 'answered' : 'unanswered'}${cell.flagged ? ', flagged' : ''}`}
          >
            {cell.index + 1}{cell.flagged && <Flag size={10} fill="currentColor" />}
          </button>
        ))}
      </div>

      <div className={`submit-callout${unanswered ? ' submit-callout--warning' : ''}`}>
        <div><strong>{unanswered ? `${unanswered} unanswered question${unanswered === 1 ? '' : 's'}` : 'Everything is answered'}</strong><p>{unanswered ? 'You can still submit, or jump back to complete them.' : 'You’re ready to see your practice profile.'}</p></div>
        <button className="button button--primary button--large" type="button" onClick={onSubmit}>Submit assessment <ArrowRight size={18} /></button>
      </div>
    </main>
  );
}

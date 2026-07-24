import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function SubmitDialog({ unanswered, total, onCancel, onConfirm }: { unanswered: number; total: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title">
        <button className="icon-btn submit-dialog__close" type="button" onClick={onCancel} aria-label="Close"><X size={20} /></button>
        <div className={`submit-dialog__icon${unanswered ? ' submit-dialog__icon--warning' : ''}`}>{unanswered ? <AlertCircle size={25} /> : <CheckCircle2 size={25} />}</div>
        <h2 id="submit-title">{unanswered ? 'Submit with blank responses?' : 'Ready to view your profile?'}</h2>
        <p>{unanswered ? `${unanswered} of ${total} questions are unanswered. Blank items reduce how much the profile can tell you.` : `All ${total} questions are complete.`}</p>
        <div className="submit-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>Keep reviewing</button>
          <button className="button button--primary" type="button" onClick={onConfirm}>Submit now</button>
        </div>
      </section>
    </div>
  );
}

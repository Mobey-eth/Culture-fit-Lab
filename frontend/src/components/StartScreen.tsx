import {
  ArrowRight, BookOpenCheck, Brain, Check, Clock3, Cloud, LibraryBig,
  SlidersHorizontal, Sparkles,
} from 'lucide-react';
import whaleMark from '../assets/whale-mark.png';
import { useAuth } from '../context/AuthContext';
import type { AttemptSnapshot, FeedbackTiming, PracticeMode } from '../types';
import type { StartInput } from '../lib/api';

export type CustomSettings = {
  count: number;
  timerEnabled: boolean;
  minutes: number;
  feedbackTiming: FeedbackTiming;
  assistanceEnabled: boolean;
};

const modes: Array<{
  key: Exclude<PracticeMode, 'retry'>;
  title: string;
  label: string;
  description: string;
  detail: string;
}> = [
  {
    key: 'guided', title: 'Guided Drill', label: '20 questions',
    description: 'Learn the formats at your own pace.', detail: 'Untimed · hints available',
  },
  {
    key: 'serious', title: 'Serious Simulation', label: 'Closest to test day',
    description: 'A focused, assistance-free run.', detail: '60 questions · 20 minutes',
  },
  {
    key: 'full', title: 'Full Practice Bank', label: 'All 200 questions',
    description: 'Cover every competency cluster.', detail: 'Untimed · results at the end',
  },
  {
    key: 'custom', title: 'Build Your Own', label: 'Flexible setup',
    description: 'Choose the pace and support level.', detail: 'Questions · timer · coaching',
  },
];

type Props = {
  selectedMode: Exclude<PracticeMode, 'retry'>;
  setSelectedMode: (mode: Exclude<PracticeMode, 'retry'>) => void;
  custom: CustomSettings;
  setCustom: (settings: CustomSettings) => void;
  onStart: (input: StartInput) => void;
  loading: boolean;
  resume: AttemptSnapshot | null;
  onResume: () => void;
  onDiscard: () => void;
  onOpenAuth: () => void;
};

export default function StartScreen({
  selectedMode, setSelectedMode, custom, setCustom, onStart, loading, resume, onResume, onDiscard, onOpenAuth,
}: Props) {
  const { user } = useAuth();
  const start = () => {
    if (selectedMode === 'custom') {
      onStart({
        mode: 'custom', count: custom.count,
        timerSeconds: custom.timerEnabled ? custom.minutes * 60 : null,
        feedbackTiming: custom.feedbackTiming,
        assistanceEnabled: custom.assistanceEnabled,
      });
    } else {
      onStart({ mode: selectedMode });
    }
  };

  return (
    <main>
      <section className="hero shell">
        <div className="hero__copy">
          <h1>Keen judgment.<br /><em>Consistent character.</em></h1>
          <p>
            Rehearse realistic work-style and scenario questions. Learn the format, understand your patterns, and show up as yourself.
          </p>
          <div className="hero__proof">
            <span><Check size={15} /> Deterministic scoring</span>
            <span><Check size={15} /> Private by default</span>
            <span><Check size={15} /> No personality “right answers”</span>
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__orb hero__orb--one" />
          <div className="hero__orb hero__orb--two" />
          <div className="hero__logo"><img src={whaleMark} alt="" /></div>
          <div className="hero__metric hero__metric--top"><Brain size={18} /><span><strong>24</strong> competency clusters</span></div>
          <div className="hero__metric hero__metric--questions"><LibraryBig size={18} /><span><strong>200</strong> culture-fit questions</span></div>
          <div className="hero__metric hero__metric--ai"><Sparkles size={18} /><span><strong>AI</strong> coaching on demand</span></div>
        </div>
      </section>

      <section className="practice shell" aria-labelledby="choose-mode">
        <div className="section-heading">
          <div><p className="eyebrow">Start a session</p><h2 id="choose-mode">Choose your practice mode</h2></div>
        </div>

        {resume && (
          <aside className="resume-card">
            <div className="resume-card__icon">{resume.source === 'cloud' ? <Cloud size={22} /> : <Clock3 size={22} />}</div>
            <div>
              <strong>Continue where you left off</strong>
              <p>{resume.settings.count} questions · {Object.keys(resume.responses).length} responses saved {resume.source === 'cloud' ? 'to your account' : 'on this device'}</p>
            </div>
            <button className="button button--primary" type="button" onClick={onResume}>Resume <ArrowRight size={17} /></button>
            <button className="text-button" type="button" onClick={onDiscard}>Discard</button>
          </aside>
        )}

        <div className="mode-grid">
          {modes.map((mode) => {
            const active = selectedMode === mode.key;
            return (
              <button
                key={mode.key} type="button" className={`mode-card${active ? ' mode-card--active' : ''}`}
                aria-pressed={active} onClick={() => setSelectedMode(mode.key)}
              >
                <span className="mode-card__check">{active && <Check size={14} />}</span>
                <span className="mode-card__label">{mode.label}</span>
                <strong>{mode.title}</strong>
                <span className="mode-card__description">{mode.description}</span>
                <span className="mode-card__detail">{mode.detail}</span>
              </button>
            );
          })}
        </div>

        {selectedMode === 'custom' && (
          <div className="custom-panel">
            <div className="custom-panel__heading"><SlidersHorizontal size={20} /><div><strong>Your settings</strong><span>Adjust before you begin.</span></div></div>
            <label className="setting-field">
              <span>Questions</span>
              <select value={custom.count} onChange={(event) => setCustom({ ...custom, count: Number(event.target.value) })}>
                {[20, 40, 60, 100, 200].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label className="switch-row">
              <span><strong>Timer</strong><small>Keep a visible countdown</small></span>
              <input type="checkbox" checked={custom.timerEnabled} onChange={(event) => setCustom({ ...custom, timerEnabled: event.target.checked })} />
            </label>
            {custom.timerEnabled && (
              <label className="setting-field"><span>Minutes</span><select value={custom.minutes} onChange={(event) => setCustom({ ...custom, minutes: Number(event.target.value) })}>{[10, 20, 30, 45, 60].map((minutes) => <option key={minutes}>{minutes}</option>)}</select></label>
            )}
            <label className="switch-row">
              <span><strong>AI coaching hints</strong><small>Only when you press Hint</small></span>
              <input type="checkbox" checked={custom.assistanceEnabled} onChange={(event) => setCustom({ ...custom, assistanceEnabled: event.target.checked })} />
            </label>
            <label className="setting-field">
              <span>Feedback</span>
              <select value={custom.feedbackTiming} onChange={(event) => setCustom({ ...custom, feedbackTiming: event.target.value as FeedbackTiming })}>
                <option value="immediate">As I go</option><option value="after">After submission</option>
              </select>
            </label>
          </div>
        )}

        <div className="start-bar">
          <div className="start-bar__note"><BookOpenCheck size={18} /><span><strong>Balanced sampling</strong> keeps each session broad and avoids taking the first rows in the bank.</span></div>
          <button className="button button--primary button--large" type="button" onClick={start} disabled={loading}>
            {loading ? 'Preparing session…' : `Start ${modes.find((mode) => mode.key === selectedMode)?.title}`} <ArrowRight size={18} />
          </button>
        </div>

        {!user && (
          <aside className="account-benefit">
            <div><strong>Track improvement over time</strong><p>Log in to save your attempts and build a practice history you can use to track your improvements and increase response consistency.</p></div>
            <button className="button button--secondary" type="button" onClick={onOpenAuth}>Login</button>
          </aside>
        )}
      </section>
    </main>
  );
}

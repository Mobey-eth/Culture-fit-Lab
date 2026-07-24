import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, FileText, LoaderCircle, RefreshCcw, ShieldCheck,
  Target, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadPdf, getCoachHistory, getCoaching, sendCoachMessage } from '../lib/api';
import { saveBlob } from '../lib/storage';
import type {
  AssessmentResponse, AssessmentResult, CandidateQuestion, Coaching, CoachingMessage,
  FocusArea, RecommendedQuestion,
} from '../types';
import ModelThinking from './ModelThinking';

type Props = {
  result: AssessmentResult;
  sessionToken: string;
  responses: AssessmentResponse[];
  questions: CandidateQuestion[];
  flaggedItemIds: string[];
  onRestart: () => void;
  onRetryFlagged: () => void;
  onPracticeFocus: (itemIds: string[]) => void;
  onOpenAuth: () => void;
};

type Competency = AssessmentResult['competencies'][number];

function plainBand(item: Competency) {
  if (item.band === 'possible_overuse') return 'Very high · review balance';
  if (item.band === 'strong') return 'Clear strength';
  if (item.band === 'balanced') return 'Balanced';
  if (item.band === 'developing') return 'Less evident';
  return 'Not sampled';
}

function focusKind(kind: FocusArea['kind']) {
  if (kind === 'scenario') return 'Scenario judgment';
  if (kind === 'balance') return 'Use with flexibility';
  if (kind === 'growth') return 'Build clearer evidence';
  return 'Consistency practice';
}

function QuestionPointer({ pointer, questions, responses }: {
  pointer: FocusArea['questions'][number];
  questions: CandidateQuestion[];
  responses: AssessmentResponse[];
}) {
  const question = questions.find((item) => item.itemId === pointer.itemId);
  const response = responses.find((item) => item.itemId === pointer.itemId);
  if (!question || !response) return null;

  const optionText = (letter: string | null) => question.options.find((option) => option.letter === letter)?.text;
  const selections = question.responseMode === 'first_second_3'
    ? [
      { label: 'First choice', text: optionText(response.mostResponse) },
      { label: 'Second choice', text: optionText(response.secondResponse) },
    ]
    : [
      { label: question.responseMode === 'sjt_best_worst_4' ? 'Most likely' : 'Most like me', text: optionText(response.mostResponse) },
      { label: question.responseMode === 'sjt_best_worst_4' ? 'Least likely' : 'Least like me', text: optionText(response.leastResponse) },
    ];

  return (
    <details className="focus-question">
      <summary><strong>Question {pointer.number}</strong><span>{question.itemType}</span></summary>
      <div><p>{question.stem}</p>{selections.map((selection) => selection.text && <p key={selection.label}><b>{selection.label}:</b> {selection.text}</p>)}</div>
    </details>
  );
}

function TendencyCard({ title, description, items, empty, tone }: {
  title: string; description: string; items: AssessmentResult['strongest']; empty: string; tone: string;
}) {
  return (
    <article className={`tendency-card tendency-card--${tone}`}>
      <div className="tendency-card__title"><strong>{title}</strong></div>
      <p className="tendency-card__description">{description}</p>
      {items.length ? <ul>{items.map((item) => <li key={item.code}><span>{item.name}</span><small>{plainBand(item)}</small></li>)}</ul> : <p className="tendency-card__empty">{empty}</p>}
    </article>
  );
}

export default function ResultsScreen({
  result, sessionToken, responses, questions, flaggedItemIds, onRestart, onRetryFlagged, onPracticeFocus, onOpenAuth,
}: Props) {
  const { user } = useAuth();
  const [coaching, setCoaching] = useState<Coaching | undefined>();
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachMessages, setCoachMessages] = useState<CoachingMessage[]>([]);
  const [coachDraft, setCoachDraft] = useState('');
  const [coachReplyLoading, setCoachReplyLoading] = useState(false);
  const [coachHistoryLoading, setCoachHistoryLoading] = useState(false);
  const [recommendedQuestions, setRecommendedQuestions] = useState<RecommendedQuestion[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [competenciesVisible, setCompetenciesVisible] = useState(false);
  const competencyDetailsRef = useRef<HTMLDetailsElement>(null);
  const consistencyMeasured = result.consistency.evaluatedClusters > 0;
  const clearStrengths = result.strongest.filter((item) => item.band === 'strong');
  const sampledCompetencies = result.competencies.filter((item) => item.opportunities > 0);
  const bandPriority: Record<Competency['band'], number> = {
    possible_overuse: 4, strong: 3, developing: 2, balanced: 1, not_sampled: 0,
  };
  const keyCompetencies = [...sampledCompetencies]
    .sort((a, b) => bandPriority[b.band] - bandPriority[a.band]
      || b.opportunities - a.opportunities
      || Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 6);
  const distribution = [
    { band: 'possible_overuse' as const, label: 'Very high', help: 'Strong; review balance' },
    { band: 'strong' as const, label: 'Clear strength', help: 'Shows up clearly' },
    { band: 'balanced' as const, label: 'Balanced', help: 'Present with flexibility' },
    { band: 'developing' as const, label: 'Less evident', help: 'Showed up less often' },
  ].map((entry) => ({ ...entry, count: sampledCompetencies.filter((item) => item.band === entry.band).length }));
  const focusAreas = result.focusAreas ?? [];
  const focusItemIds = [...new Set(focusAreas.flatMap((area) => area.questions.map((question) => question.itemId)))];

  useEffect(() => {
    const node = competencyDetailsRef.current;
    if (!node || !('IntersectionObserver' in window)) {
      setCompetenciesVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setCompetenciesVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.18, rootMargin: '0px 0px -5% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!user) {
      setCoachMessages([]);
      setRecommendedQuestions([]);
      return undefined;
    }
    let active = true;
    setCoachHistoryLoading(true);
    getCoachHistory(sessionToken)
      .then((data) => {
        if (!active) return;
        setCoachMessages(data.messages);
        setRecommendedQuestions(data.recommendedQuestions);
      })
      .catch((caught) => {
        if (active) setError((caught as Error).message);
      })
      .finally(() => {
        if (active) setCoachHistoryLoading(false);
      });
    return () => { active = false; };
  }, [sessionToken, user]);

  const generateCoaching = async () => {
    setCoachingLoading(true);
    setError('');
    try {
      setCoaching((await getCoaching(sessionToken, responses)).coaching);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCoachingLoading(false);
    }
  };

  const generatePdf = async () => {
    setPdfLoading(true);
    setError('');
    try {
      const blob = await downloadPdf(sessionToken, responses, coaching);
      saveBlob(blob, `culturefit-report-${result.attemptId.slice(0, 8)}.pdf`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const talkToCoach = async () => {
    const message = coachDraft.trim();
    if (!message || coachReplyLoading) return;
    setCoachReplyLoading(true);
    setError('');
    try {
      const data = await sendCoachMessage(sessionToken, responses, message);
      setCoachMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      setRecommendedQuestions(data.recommendedQuestions);
      setCoachDraft('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCoachReplyLoading(false);
    }
  };

  return (
    <main className="results-page">
      <section className="results-hero">
        <div className="shell">
          <p className="eyebrow eyebrow--light">Practice profile</p>
          <h1>Your choices tell a story.<br /><em>Read it with curiosity.</em></h1>
          <p>These are response patterns, not a pass or fail grade. Higher is not always better: a very high pattern can also become an overused habit.</p>
        </div>
      </section>

      <div className="shell results-content">
        <section className="result-stats" aria-label="Assessment summary">
          <article><span className="stat-icon"><CheckCircle2 size={20} /></span><div><small>Completion</small><strong>{result.completion.answered}<em>/{result.completion.total}</em></strong><p>{result.completion.percentage}% complete</p></div></article>
          <article><span className="stat-icon stat-icon--teal"><ShieldCheck size={20} /></span><div><small>Consistency</small><strong>{consistencyMeasured ? result.consistency.label : 'Not measured'}</strong><p>{consistencyMeasured ? `${result.consistency.percentage}% across ${result.consistency.evaluatedClusters} repeated clusters` : 'No repeated cluster to compare'}</p></div></article>
          <article><span className="stat-icon stat-icon--blue"><Target size={20} /></span><div><small>Scenario judgment</small><strong>{result.scenarioJudgment.total ? `${result.scenarioJudgment.percentage}%` : 'Not measured'}</strong><p>{result.scenarioJudgment.total ? `${result.scenarioJudgment.total} scenarios scored separately` : 'No scenario answers to score'}</p></div></article>
          <article><span className="stat-icon stat-icon--gold"><TrendingUp size={20} /></span><div><small>Practice-profile match</small><strong>{sampledCompetencies.length ? `${result.profileAlignment}%` : 'Not measured'}</strong><p>{sampledCompetencies.length ? 'How often priority work traits appeared · not pass/fail' : 'No work-style answers to compare'}</p></div></article>
        </section>

        <section className="tendency-grid" aria-label="Tendency summary">
          <TendencyCard title="Clear strengths" description="These traits came through clearly without reaching the very-high range." items={clearStrengths} empty="No traits landed in this range. Check the very-high and balanced cards instead." tone="strong" />
          <TendencyCard title="Balanced patterns" description="These traits were present, while leaving room for other ways of working." items={result.balanced} empty="No sampled traits landed in the balanced range this time." tone="balanced" />
          <TendencyCard title="Very high patterns" description="This is not a bad result. It means a strength appeared repeatedly, so it is worth checking whether it sometimes crowds out another useful behaviour." items={result.possibleOveruse} empty="No trait appeared strongly across enough repeated opportunities to need a balance review." tone="watch" />
        </section>

        <section className="profile-section" aria-labelledby="competencies-title">
          <div className="section-heading section-heading--compact">
            <div><p className="eyebrow">Competency overview</p><h2 id="competencies-title">Key patterns from this session</h2></div>
            <p>High means a trait appeared often in your answers. It does not mean the trait is always better.</p>
          </div>
          <div className="competency-overview">
            <div className="key-pattern-chart">
              <div className="chart-heading"><strong>Six clearest signals</strong><span>Less evident <i /> More evident</span></div>
              {keyCompetencies.length ? keyCompetencies.map((item) => (
                <div className="key-pattern" key={item.code}>
                  <div className="key-pattern__label"><span>{item.name}</span><small>{item.score}% · {plainBand(item)}</small></div>
                  <div className="competency__track" role="progressbar" aria-label={`${item.name}: ${item.score} percent, ${plainBand(item)}`} aria-valuenow={item.score} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`competency__fill competency__fill--${item.band}`} style={{ width: `${item.score}%` }} />
                  </div>
                </div>
              )) : <p className="chart-empty">Complete more work-style items to build this chart.</p>}
            </div>

            <div className="distribution-chart">
              <div className="chart-heading"><strong>How your patterns are spread</strong><span>{sampledCompetencies.length} of {result.competencies.length} clusters sampled</span></div>
              <div
                className="distribution-bar"
                role="img"
                aria-label={distribution.map((entry) => `${entry.label}: ${entry.count}`).join(', ')}
              >
                {distribution.filter((entry) => entry.count > 0).map((entry) => (
                  <span key={entry.band} className={`distribution-bar__${entry.band}`} style={{ flexGrow: entry.count }} />
                ))}
              </div>
              <ul className="distribution-legend">
                {distribution.map((entry) => (
                  <li key={entry.band}><i className={`legend-dot legend-dot--${entry.band}`} /><span><strong>{entry.count} {entry.label}</strong><small>{entry.help}</small></span></li>
                ))}
              </ul>
              <p>{result.competencies.length - sampledCompetencies.length} clusters were not sampled in this session.</p>
            </div>
          </div>

          <details ref={competencyDetailsRef} className={`competency-details competency-details--reveal${competenciesVisible ? ' is-visible' : ''}`}>
            <summary><span><strong>See all {result.competencies.length} competency clusters</strong><small>Open the complete on-page breakdown</small></span><b>{sampledCompetencies.length}/{result.competencies.length} sampled</b></summary>
            <div className="competency-grid">
              {result.competencies.map((item) => (
                <div className="competency" key={item.code}>
                  <div className="competency__label"><span>{item.name}</span><small>{item.opportunities ? `${item.score}% · ${plainBand(item)}` : 'Not sampled'}</small></div>
                  <div className="competency__track" role="progressbar" aria-label={`${item.name}: ${item.opportunities ? `${item.score} percent` : 'not sampled'}`} aria-valuenow={item.opportunities ? item.score : 0} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`competency__fill competency__fill--${item.band}`} style={{ width: `${item.opportunities ? item.score : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="profile-report-cta">
              <p><strong>Want the full breakdown to keep?</strong><span>The PDF includes every competency, consistency notes, and any AI coaching you generated.</span></p>
              <button className="button button--secondary" type="button" onClick={() => void generatePdf()} disabled={pdfLoading}>{pdfLoading ? <LoaderCircle className="spin" size={17} /> : <FileText size={17} />}{pdfLoading ? 'Creating PDF…' : 'Download detailed report'}</button>
            </div>
          </details>
        </section>

        <section className="consistency-card">
          <div className="consistency-card__icon"><ShieldCheck size={22} /></div>
          <div>
            <p className="eyebrow">Consistency, not perfection</p>
            <h2>{consistencyMeasured ? `${result.consistency.label} response alignment` : 'Consistency was not measured'}</h2>
            <p>{consistencyMeasured ? result.consistency.note : 'This session did not contain two answered questions from the same competency cluster. That is a sampling limitation, not evidence that your answers were inconsistent.'}</p>
            <small>{consistencyMeasured ? 'One contradiction is never treated as dishonesty. The indicator only becomes cautionary when a pattern repeats across several clusters.' : 'New practice sessions now pair related questions so this indicator can be calculated.'}</small>
          </div>
        </section>

        {result.scenarioReview.length > 0 && (
          <section className="scenario-review">
            <div className="section-heading section-heading--compact"><div><p className="eyebrow">Scenario review</p><h2>Preferred and weakest actions</h2></div><p>Shown only after submission.</p></div>
            <div className="scenario-review__list">
              {result.scenarioReview.map((item, index) => (
                <details key={item.itemId}>
                  <summary><span>Scenario {index + 1}</span><strong>{item.competency}</strong><ArrowRight size={16} /></summary>
                  <div><p><b>Generally preferred:</b> {item.preferred?.text}</p><p><b>Generally weakest:</b> {item.weakest?.text}</p></div>
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="ai-coach" aria-labelledby="ai-coach-title" aria-busy={coachingLoading}>
          <div className="ai-coach__header">
            <div><h2 id="ai-coach-title">Understand your results and know what to practise</h2><p>Click Generate AI coaching for a plain-English review of your strongest patterns, the answers worth revisiting, and a short plan for your next practice session. Nothing is generated until you click the button.</p></div>
            {!coaching && <button className="button button--light" type="button" onClick={() => void generateCoaching()} disabled={coachingLoading}>{coachingLoading ? 'Building your coaching…' : 'Generate AI coaching'}</button>}
          </div>
          {coachingLoading && <ModelThinking context="coaching" dark className="ai-coach__thinking" />}
          {coaching && (
            <div className="coaching-content">
              <p className="coaching-content__summary">{coaching.summary}</p>
              <div className="coaching-columns">
                <div><h3>Coaching tips</h3><ul>{coaching.coachingTips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div>
                <div><h3>Next practice plan</h3><ol>{coaching.practicePlan.map((step) => <li key={step}>{step}</li>)}</ol></div>
              </div>
              <div className="coaching-consistency"><strong>For more consistent answers</strong><p>{coaching.consistencyCoaching}</p></div>
            </div>
          )}
        </section>

        <section className="coach-dialogue" aria-labelledby="coach-dialogue-title">
          <div className="section-heading section-heading--compact">
            <div><p className="eyebrow">Continue the conversation</p><h2 id="coach-dialogue-title">Tell the coach what it missed</h2></div>
            <p>This is different from the results review above. Here, you can add context, correct an assumption, or name a skill you want to improve. The coach will reply to what you say and find practice questions that match your goal.</p>
          </div>
          {!user ? (
            <div className="coach-signin">
              <div><strong>Login to save the conversation</strong><p>Your messages and recommendations stay with your account, so you can return and track your progress over time.</p></div>
              <button className="button button--primary" type="button" onClick={onOpenAuth}>Login</button>
            </div>
          ) : (
            <>
              <div className="coach-starters" aria-label="Conversation starters">
                {[
                  'I think one of these results assumes something wrong about me.',
                  'I want to get better at difficult conversations.',
                  'Help me balance ambition with being a reliable teammate.',
                ].map((starter) => (
                  <button key={starter} type="button" onClick={() => setCoachDraft(starter)}>{starter}</button>
                ))}
              </div>

              <div className="coach-thread" aria-live="polite" aria-busy={coachHistoryLoading || coachReplyLoading}>
                {coachHistoryLoading && <p className="coach-thread__status"><LoaderCircle className="spin" size={16} /> Loading your conversation…</p>}
                {!coachHistoryLoading && !coachMessages.length && (
                  <div className="coach-thread__empty"><strong>You know your context better than a score does.</strong><p>Tell the coach what feels accurate, what does not, or what you want to improve. It will respond to your words as well as the measured results.</p></div>
                )}
                {coachMessages.map((message) => (
                  <article className={`coach-message coach-message--${message.role}`} key={message.id}>
                    <span>{message.role === 'user' ? 'You' : 'Your coach'}</span>
                    <p>{message.content}</p>
                    {message.nextSteps.length > 0 && (
                      <div className="coach-message__steps"><strong>Try next</strong><ul>{message.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul></div>
                    )}
                  </article>
                ))}
                {coachReplyLoading && <ModelThinking context="conversation" compact className="coach-thread__status" />}
              </div>

              {recommendedQuestions.length > 0 && (
                <div className="coach-recommendations">
                  <div className="coach-recommendations__heading"><div><strong>Questions chosen for your next practice</strong><span>Selected from the database using this conversation and your results.</span></div><button className="button button--secondary" type="button" onClick={() => onPracticeFocus(recommendedQuestions.map((item) => item.itemId))}>Practice these questions</button></div>
                  <div className="coach-recommendations__grid">
                    {recommendedQuestions.map((question) => (
                      <article key={question.itemId}><span>{question.competency}</span><strong>{question.stem}</strong><p>{question.reason}</p></article>
                    ))}
                  </div>
                </div>
              )}

              <form className="coach-composer" onSubmit={(event) => { event.preventDefault(); void talkToCoach(); }}>
                <label htmlFor="coach-feedback">What should the coach understand about you?</label>
                <textarea id="coach-feedback" value={coachDraft} onChange={(event) => setCoachDraft(event.target.value)} maxLength={1500} rows={4} placeholder="For example: I do speak up, but usually after I have checked the facts. I want to improve how quickly I address conflict." />
                <div><small>Do not share passwords, recovery answers, or confidential workplace information. AI can be mistaken. You are invited to correct it.</small><button className="button button--primary" type="submit" disabled={!coachDraft.trim() || coachReplyLoading}>{coachReplyLoading ? 'Thinking…' : 'Send to coach'}</button></div>
              </form>
            </>
          )}
        </section>

        <section className="focus-section" aria-labelledby="focus-title">
          <div className="section-heading section-heading--compact">
            <div><p className="eyebrow">Next attempt</p><h2 id="focus-title">Where to focus next</h2></div>
            <p>Scenario tips use answer quality. Work-style tips support reflection and consistency. They do not label personality answers as correct.</p>
          </div>
          {focusAreas.length ? (
            <div className="focus-grid">
              {focusAreas.map((area) => (
                <article className={`focus-card focus-card--${area.kind}`} key={area.id}>
                  <span>{focusKind(area.kind)}</span>
                  <h3>{area.title}</h3>
                  <p>{area.guidance}</p>
                  {area.questions.length > 0 && (
                    <div className="focus-card__questions">
                      {area.questions.map((pointer) => <QuestionPointer key={pointer.itemId} pointer={pointer} questions={questions} responses={responses} />)}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : <p className="focus-empty">Complete more answered items to build specific next-step tips.</p>}
          <div className="focus-footer">
            <p><strong>Practice the exact items again</strong><span>The optional AI coach also uses these focus areas when you request coaching.</span></p>
            <button className="button button--primary" type="button" disabled={!focusItemIds.length} onClick={() => onPracticeFocus(focusItemIds)}>Practice focus questions</button>
          </div>
        </section>

        {error && <div className="form-alert form-alert--error results-error" role="alert">{error}</div>}

        <section className="results-actions">
          <div><h2>Keep your report</h2></div>
          <div className="results-actions__buttons">
            <button className="button button--primary" type="button" onClick={() => void generatePdf()} disabled={pdfLoading}>{pdfLoading ? <LoaderCircle className="spin" size={17} /> : <FileText size={17} />}{pdfLoading ? 'Creating PDF…' : 'Download PDF report'}</button>
            <button className="button button--secondary" type="button" onClick={onRetryFlagged} disabled={!flaggedItemIds.length}><RefreshCcw size={17} /> Retry flagged ({flaggedItemIds.length})</button>
            <button className="button button--quiet" type="button" onClick={onRestart}>Start a new session</button>
          </div>
        </section>
      </div>
    </main>
  );
}

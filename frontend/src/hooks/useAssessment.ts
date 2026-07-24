import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createSession, deleteCloudAttempt, getHint, latestCloudAttempt, saveCloudAttempt, scoreSession, type StartInput } from '../lib/api';
import { emptyResponse, isResponseValid, setChoice } from '../lib/assessment';
import { clearAttempt, loadAttempt, saveAttempt } from '../lib/storage';
import type {
  AssessmentResponse, AssessmentResult, AttemptSnapshot, CandidateQuestion, Hint,
  OptionLetter, PracticeMode, SessionSettings,
} from '../types';
import type { CustomSettings } from '../components/StartScreen';

type Screen = 'start' | 'loading' | 'assessment' | 'review' | 'submitting' | 'results';

export function useAssessment() {
  const { user } = useAuth();
  const [screen, setScreen] = useState<Screen>('start');
  const [selectedMode, setSelectedMode] = useState<Exclude<PracticeMode, 'retry'>>('guided');
  const [custom, setCustom] = useState<CustomSettings>({
    count: 40, timerEnabled: false, minutes: 20, feedbackTiming: 'after', assistanceEnabled: true,
  });
  const [attemptId, setAttemptId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [questions, setQuestions] = useState<CandidateQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AssessmentResponse>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [resumeSnapshot, setResumeSnapshot] = useState<AttemptSnapshot | null>(() => loadAttempt());
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [error, setError] = useState('');
  const [hints, setHints] = useState<Record<string, Hint>>({});
  const [hintLoading, setHintLoading] = useState('');
  const questionStartedAt = useRef(Date.now());
  const submitting = useRef(false);
  const latestSnapshot = useRef<AttemptSnapshot | null>(null);

  const active = (screen === 'assessment' || screen === 'review') && Boolean(attemptId && settings && questions.length);
  const currentQuestion = questions[currentIndex] ?? null;

  const snapshot = useCallback((): AttemptSnapshot | null => {
    if (!attemptId || !settings || !questions.length || (screen !== 'assessment' && screen !== 'review')) return null;
    return {
      savedAt: new Date().toISOString(), attemptId, sessionToken, settings, questions,
      responses, flagged, currentIndex, timeRemaining, screen, source: 'local',
    };
  }, [attemptId, settings, questions, sessionToken, responses, flagged, currentIndex, timeRemaining, screen]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    latestCloudAttempt().then((cloud) => {
      if (cancelled || !cloud) return;
      setResumeSnapshot((local) => !local || new Date(cloud.savedAt) > new Date(local.savedAt) ? cloud : local);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const value = snapshot();
    latestSnapshot.current = value;
    if (value) {
      saveAttempt(value);
      if (screen === 'start') setResumeSnapshot(value);
    }
  }, [snapshot, screen]);

  useEffect(() => {
    if (!user || !active) return undefined;
    const timeout = window.setTimeout(() => {
      const value = latestSnapshot.current;
      if (value) void saveCloudAttempt(value).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [user, active, responses, flagged, currentIndex, screen, attemptId]);

  useEffect(() => {
    if (!user || !active) return undefined;
    const interval = window.setInterval(() => {
      const value = latestSnapshot.current;
      if (value) void saveCloudAttempt(value).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [user, active, attemptId]);

  useEffect(() => {
    if (!active || !settings?.timerSeconds) return undefined;
    const interval = window.setInterval(() => setTimeRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [active, settings?.timerSeconds]);

  const submit = useCallback(async () => {
    if (!sessionToken || submitting.current) return;
    submitting.current = true;
    setShowSubmit(false);
    setScreen('submitting');
    setError('');
    try {
      const scored = await scoreSession(sessionToken, Object.values(responses));
      setResult(scored.result);
      setScreen('results');
      clearAttempt();
      setResumeSnapshot(null);
    } catch (caught) {
      setError((caught as Error).message);
      setScreen('review');
    } finally {
      submitting.current = false;
    }
  }, [sessionToken, responses]);

  useEffect(() => {
    if (active && settings?.timerSeconds && timeRemaining === 0) void submit();
  }, [active, settings?.timerSeconds, timeRemaining, submit]);

  const applySnapshot = (value: AttemptSnapshot) => {
    setAttemptId(value.attemptId);
    setSessionToken(value.sessionToken);
    setSettings(value.settings);
    setQuestions(value.questions);
    setResponses(value.responses ?? {});
    setFlagged(value.flagged ?? {});
    setCurrentIndex(Math.min(value.currentIndex ?? 0, value.questions.length - 1));
    setTimeRemaining(value.timeRemaining ?? value.settings.timerSeconds ?? 0);
    setScreen(value.screen === 'review' ? 'review' : 'assessment');
    setResumeSnapshot(null);
    setResult(null);
    setHints({});
    questionStartedAt.current = Date.now();
  };

  const start = async (input: StartInput) => {
    setScreen('loading');
    setError('');
    try {
      const session = await createSession(input);
      applySnapshot({
        ...session, responses: {}, flagged: {}, currentIndex: 0,
        timeRemaining: session.settings.timerSeconds ?? 0, screen: 'assessment',
        savedAt: new Date().toISOString(), source: 'local',
      });
    } catch (caught) {
      setError((caught as Error).message);
      setScreen('start');
    }
  };

  const pick = (slot: 'mostResponse' | 'leastResponse' | 'secondResponse', letter: OptionLetter) => {
    if (!currentQuestion) return;
    setResponses((current) => {
      const existing = current[currentQuestion.itemId] ?? emptyResponse(currentQuestion, attemptId);
      const updated = setChoice(existing, slot, letter);
      updated.responseTimeMs += Date.now() - questionStartedAt.current;
      updated.answeredAt = new Date().toISOString();
      updated.flagged = Boolean(flagged[currentQuestion.itemId]);
      return { ...current, [currentQuestion.itemId]: updated };
    });
    questionStartedAt.current = Date.now();
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const nextValue = !flagged[currentQuestion.itemId];
    setFlagged((current) => ({ ...current, [currentQuestion.itemId]: nextValue }));
    setResponses((current) => current[currentQuestion.itemId]
      ? { ...current, [currentQuestion.itemId]: { ...current[currentQuestion.itemId], flagged: nextValue } }
      : current);
  };

  const next = () => {
    if (!currentQuestion || !isResponseValid(currentQuestion, responses[currentQuestion.itemId])) return;
    if (currentIndex >= questions.length - 1) setScreen('review');
    else setCurrentIndex((index) => index + 1);
    questionStartedAt.current = Date.now();
  };

  const back = () => {
    setCurrentIndex((index) => Math.max(0, index - 1));
    questionStartedAt.current = Date.now();
  };

  const requestHint = async () => {
    if (!currentQuestion || hints[currentQuestion.itemId]) return;
    setHintLoading(currentQuestion.itemId);
    setError('');
    try {
      const previousHints = Object.values(hints).slice(-5).map(({ title, guidance }) => ({ title, guidance }));
      const data = await getHint(sessionToken, currentQuestion.itemId, previousHints);
      setHints((current) => ({ ...current, [currentQuestion.itemId]: data.hint }));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setHintLoading('');
    }
  };

  const exit = () => {
    const value = snapshot();
    if (value) {
      saveAttempt(value);
      setResumeSnapshot(value);
    }
    setScreen('start');
  };

  const restart = () => {
    clearAttempt();
    setScreen('start');
    setAttemptId('');
    setSessionToken('');
    setSettings(null);
    setQuestions([]);
    setResponses({});
    setFlagged({});
    setCurrentIndex(0);
    setTimeRemaining(0);
    setResult(null);
    setResumeSnapshot(null);
    setHints({});
  };

  const retryFlagged = () => {
    const itemIds = questions.filter((question) => flagged[question.itemId]).map((question) => question.itemId);
    if (itemIds.length) void start({ mode: 'retry', itemIds, assistanceEnabled: true, feedbackTiming: 'immediate' });
  };

  const retryItems = (itemIds: string[]) => {
    const allowed = new Set(questions.map((question) => question.itemId));
    const unique = [...new Set(itemIds)].filter((itemId) => allowed.has(itemId));
    if (unique.length) void start({ mode: 'retry', itemIds: unique, assistanceEnabled: true, feedbackTiming: 'immediate' });
  };

  const answered = useMemo(
    () => questions.filter((question) => isResponseValid(question, responses[question.itemId])).length,
    [questions, responses],
  );

  return {
    state: {
      screen, selectedMode, custom, attemptId, sessionToken, settings, questions, responses,
      flagged, currentIndex, timeRemaining, resumeSnapshot, result, showSubmit, error,
      currentQuestion, answered, hint: currentQuestion ? hints[currentQuestion.itemId] : undefined,
      hintLoading: currentQuestion ? hintLoading === currentQuestion.itemId : false,
    },
    actions: {
      setSelectedMode, setCustom, start, pick, toggleFlag, next, back,
      goReview: () => setScreen('review'),
      goAssessment: () => setScreen('assessment'),
      jumpTo: (index: number) => { setCurrentIndex(index); setScreen('assessment'); questionStartedAt.current = Date.now(); },
      openSubmit: () => setShowSubmit(true),
      closeSubmit: () => setShowSubmit(false),
      submit, exit, restart, retryFlagged, retryItems, requestHint,
      resume: () => resumeSnapshot && applySnapshot(resumeSnapshot),
      discardResume: () => {
        if (resumeSnapshot?.source === 'cloud') void deleteCloudAttempt(resumeSnapshot.attemptId).catch(() => undefined);
        clearAttempt();
        setResumeSnapshot(null);
      },
      clearError: () => setError(''),
    },
  };
}

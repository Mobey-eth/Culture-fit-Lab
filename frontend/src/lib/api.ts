import type {
  AssessmentResponse,
  AssessmentResult,
  AttemptSnapshot,
  Coaching,
  CoachingMessage,
  Hint,
  PracticeMode,
  SessionSettings,
  RecommendedQuestion,
  User,
} from '../types';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export type StartInput = {
  mode: PracticeMode;
  count?: number;
  timerSeconds?: number | null;
  feedbackTiming?: 'immediate' | 'after';
  assistanceEnabled?: boolean;
  itemIds?: string[];
};

export async function createSession(input: StartInput) {
  return api<{
    attemptId: string;
    sessionToken: string;
    settings: SessionSettings;
    questions: AttemptSnapshot['questions'];
  }>('/api/sessions', { method: 'POST', body: JSON.stringify(input) });
}

export async function scoreSession(sessionToken: string, responses: AssessmentResponse[]) {
  return api<{ result: AssessmentResult }>('/api/sessions/score', {
    method: 'POST', body: JSON.stringify({ sessionToken, responses }),
  });
}

export async function getHint(sessionToken: string, itemId: string, previousHints: Array<Pick<Hint, 'title' | 'guidance'>> = []) {
  return api<{ hint: Hint }>('/api/ai/hint', {
    method: 'POST', body: JSON.stringify({ sessionToken, itemId, previousHints: previousHints.slice(-5) }),
  });
}

export async function getCoaching(sessionToken: string, responses: AssessmentResponse[]) {
  return api<{ coaching: Coaching }>('/api/ai/analyze', {
    method: 'POST', body: JSON.stringify({ sessionToken, responses }),
  });
}

export async function getCoachHistory(sessionToken: string) {
  return api<{ messages: CoachingMessage[]; recommendedQuestions: RecommendedQuestion[] }>('/api/ai/coach/history', {
    method: 'POST', body: JSON.stringify({ sessionToken }),
  });
}

export async function sendCoachMessage(
  sessionToken: string,
  responses: AssessmentResponse[],
  message: string,
) {
  return api<{
    userMessage: CoachingMessage;
    assistantMessage: CoachingMessage;
    recommendedQuestions: RecommendedQuestion[];
  }>('/api/ai/coach/chat', {
    method: 'POST', body: JSON.stringify({ sessionToken, responses, message }),
  });
}

export async function saveCloudAttempt(snapshot: AttemptSnapshot) {
  return api<void>(`/api/attempts/${snapshot.attemptId}`, {
    method: 'PUT',
    body: JSON.stringify({
      sessionToken: snapshot.sessionToken,
      responses: Object.values(snapshot.responses),
      flagged: snapshot.flagged,
      currentIndex: snapshot.currentIndex,
      timeRemaining: snapshot.timeRemaining,
      screen: snapshot.screen,
    }),
  });
}

export async function latestCloudAttempt() {
  const data = await api<{ attempt: Omit<AttemptSnapshot, 'savedAt' | 'source'> & { updatedAt: string } } | undefined>('/api/attempts/latest');
  if (!data) return null;
  return { ...data.attempt, savedAt: data.attempt.updatedAt, source: 'cloud' as const };
}

export async function deleteCloudAttempt(attemptId: string) {
  return api<void>(`/api/attempts/${attemptId}`, { method: 'DELETE' });
}

export async function downloadPdf(
  sessionToken: string,
  responses: AssessmentResponse[],
  coaching?: Coaching,
) {
  const response = await fetch(apiUrl('/api/reports/pdf'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken, responses, coaching }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'The PDF could not be generated.');
  }
  return response.blob();
}

export const authApi = {
  me: () => api<{ user: User | null }>('/api/auth/me'),
  login: (username: string, password: string) => api<{ user: User }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  register: (data: { username: string; email?: string; password: string; recoveryQuestion: string; recoveryAnswer: string }) =>
    api<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => api<void>('/api/auth/logout', { method: 'POST' }),
  challenge: (username: string) => api<{ question: string }>('/api/auth/recovery/challenge', {
    method: 'POST', body: JSON.stringify({ username }),
  }),
  reset: (data: { username: string; recoveryAnswer: string; newPassword: string }) =>
    api<{ message: string }>('/api/auth/recovery/reset', { method: 'POST', body: JSON.stringify(data) }),
};

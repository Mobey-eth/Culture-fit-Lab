import type { AssessmentResponse, AttemptSnapshot } from '../types';

const ATTEMPT_KEY = 'culturefit-attempt-v2';

export function loadAttempt(): AttemptSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTEMPT_KEY) ?? 'null') as AttemptSnapshot | null;
    if (!parsed?.attemptId || !parsed.questions?.length || !parsed.sessionToken) return null;
    return { ...parsed, source: 'local' };
  } catch {
    return null;
  }
}

export function saveAttempt(snapshot: AttemptSnapshot) {
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(snapshot));
  } catch {
    // Private browsing and storage quotas should not interrupt an active attempt.
  }
}

export function clearAttempt() {
  localStorage.removeItem(ATTEMPT_KEY);
}

export function downloadResponseJson(attemptId: string, responses: AssessmentResponse[]) {
  const blob = new Blob([JSON.stringify(responses, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `culturefit-responses-${attemptId.slice(0, 8)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

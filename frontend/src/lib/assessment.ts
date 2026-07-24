import type { AssessmentResponse, CandidateQuestion, OptionLetter } from '../types';

export function isResponseValid(question: CandidateQuestion, response?: AssessmentResponse) {
  if (!response) return false;
  if (question.responseMode === 'first_second_3') {
    return Boolean(response.mostResponse && response.secondResponse && response.mostResponse !== response.secondResponse);
  }
  return Boolean(response.mostResponse && response.leastResponse && response.mostResponse !== response.leastResponse);
}

export function emptyResponse(question: CandidateQuestion, attemptId: string): AssessmentResponse {
  return {
    attemptId,
    itemId: question.itemId,
    responseMode: question.responseMode,
    mostResponse: null,
    leastResponse: null,
    secondResponse: null,
    flagged: false,
    responseTimeMs: 0,
    answeredAt: new Date(0).toISOString(),
  };
}

export function setChoice(
  response: AssessmentResponse,
  slot: 'mostResponse' | 'leastResponse' | 'secondResponse',
  letter: OptionLetter,
) {
  const next = { ...response, [slot]: response[slot] === letter ? null : letter } as AssessmentResponse;
  const paired = slot === 'mostResponse'
    ? (response.responseMode === 'first_second_3' ? 'secondResponse' : 'leastResponse')
    : 'mostResponse';
  if (next[slot] && next[paired] === letter) next[paired] = null;
  return next;
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

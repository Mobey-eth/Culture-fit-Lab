import { beforeEach, describe, expect, it } from 'vitest';
import { clearAttempt, loadAttempt, saveAttempt } from './storage';
import type { AttemptSnapshot } from '../types';

const snapshot: AttemptSnapshot = {
  savedAt: '2026-07-24T12:00:00.000Z',
  attemptId: '00000000-0000-4000-8000-000000000000',
  sessionToken: 'signed-session',
  settings: { mode: 'guided', count: 20, timerSeconds: null, feedbackTiming: 'immediate', assistanceEnabled: true },
  questions: [{
    itemId: 'JFA001', itemType: 'Work style', responseMode: 'most_least_3', instruction: 'Choose.', stem: 'Which?',
    options: [{ letter: 'A', text: 'A' }, { letter: 'B', text: 'B' }, { letter: 'C', text: 'C' }],
  }],
  responses: {}, flagged: {}, currentIndex: 0, timeRemaining: 0, screen: 'assessment', source: 'local',
};

describe('attempt storage', () => {
  beforeEach(() => localStorage.clear());

  it('restores a valid unfinished attempt after refresh', () => {
    saveAttempt(snapshot);
    expect(loadAttempt()).toMatchObject({ attemptId: snapshot.attemptId, currentIndex: 0, source: 'local' });
  });

  it('clears a discarded attempt', () => {
    saveAttempt(snapshot);
    clearAttempt();
    expect(loadAttempt()).toBeNull();
  });
});

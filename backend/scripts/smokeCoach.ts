import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { signAuthToken } from '../src/auth/tokens.js';
import type { AssessmentResponse, CandidateQuestion } from '../src/types.js';

type SessionResponse = {
  attemptId: string;
  sessionToken: string;
  questions: CandidateQuestion[];
};

async function json<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${process.env.COACH_SMOKE_API_URL ?? 'http://127.0.0.1:4000'}${path}`, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}.`);
  return body;
}

async function smokeCoach() {
  const userId = randomUUID();
  const username = `coach_smoke_${Date.now()}`;
  const hash = await bcrypt.hash(randomUUID(), 4);
  try {
    await pool.query(
      `INSERT INTO app_users (id, username, email, password_hash, recovery_question, recovery_answer_hash)
       VALUES ($1, $2, NULL, $3, 'What was the name of your first pet?', $3)`,
      [userId, username, hash],
    );
    const auth = signAuthToken({ userId, username, email: null, role: 'learner' });
    const cookie = `culturefit_auth=${auth}`;
    const session = await json<SessionResponse>('/api/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'guided' }),
    });
    const responses: AssessmentResponse[] = session.questions.map((question) => ({
      attemptId: session.attemptId,
      itemId: question.itemId,
      responseMode: question.responseMode,
      mostResponse: 'A',
      leastResponse: question.responseMode === 'first_second_3' ? null : 'B',
      secondResponse: question.responseMode === 'first_second_3' ? 'B' : null,
      flagged: false,
      responseTimeMs: 1000,
      answeredAt: new Date().toISOString(),
    }));
    await json('/api/sessions/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ sessionToken: session.sessionToken, responses }),
    });
    const analysis = await json<{ coaching: { summary: string; coachingTips: string[]; practicePlan: string[] } }>('/api/ai/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ sessionToken: session.sessionToken, responses }),
    });
    if (!analysis.coaching.summary || analysis.coaching.coachingTips.length < 3 || analysis.coaching.practicePlan.length < 3) {
      throw new Error('Initial results coaching was incomplete.');
    }
    const turn = await json<{
      assistantMessage: { content: string; nextSteps: string[]; recommendations: Array<{ itemId: string }> };
      recommendedQuestions: Array<{ itemId: string; competency: string; reason: string }>;
    }>('/api/ai/coach/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        sessionToken: session.sessionToken,
        responses,
        message: 'The result may understate how I handle difficult conversations. I usually check the facts first and then speak directly. I want to address issues sooner without becoming harsh.',
      }),
    });
    if (!turn.assistantMessage.content || !turn.assistantMessage.nextSteps.length || !turn.recommendedQuestions.length) {
      throw new Error('Live coaching turn was missing tailored text, next steps, or database recommendations.');
    }
    const history = await json<{ messages: Array<{ role: string }>; recommendedQuestions: Array<{ itemId: string }> }>('/api/ai/coach/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ sessionToken: session.sessionToken }),
    });
    if (history.messages.length !== 2 || history.messages[0].role !== 'user' || history.messages[1].role !== 'assistant'
      || !history.recommendedQuestions.length) {
      throw new Error('Saved coaching history did not restore the complete turn and recommendations.');
    }
    console.log(`Live coaching smoke passed: tailored results analysis, ${turn.assistantMessage.nextSteps.length} next steps, and ${turn.recommendedQuestions.length} database questions.`);
  } finally {
    await pool.query('DELETE FROM app_users WHERE id = $1', [userId]);
  }
}

smokeCoach()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

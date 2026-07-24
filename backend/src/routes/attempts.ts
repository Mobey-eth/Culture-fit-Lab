import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { signSessionToken, verifySessionToken } from '../auth/tokens.js';
import { pool } from '../db.js';
import { getQuestionsByIds, toCandidateQuestion } from '../repository/questions.js';
import { responseSchema } from './sessions.js';
import type { SessionSettings } from '../types.js';

const router = Router();
router.use(requireAuth);

router.put('/:attemptId', async (request: AuthenticatedRequest, response) => {
  const data = z.object({
    sessionToken: z.string().min(1),
    responses: z.array(responseSchema).max(200),
    flagged: z.record(z.string(), z.boolean()),
    currentIndex: z.number().int().min(0).max(199),
    timeRemaining: z.number().int().min(0).max(7200),
    screen: z.enum(['assessment', 'review']),
  }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  if (session.attemptId !== request.params.attemptId) {
    response.status(400).json({ error: 'Attempt and session do not match.' });
    return;
  }
  await pool.query(
    `INSERT INTO assessment_attempts
      (id, user_id, mode, settings, question_ids, responses, flagged, current_index, time_remaining, screen)
     VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6::jsonb, $7::jsonb, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
      responses = EXCLUDED.responses, flagged = EXCLUDED.flagged,
      current_index = EXCLUDED.current_index, time_remaining = EXCLUDED.time_remaining,
      screen = EXCLUDED.screen, updated_at = now()
     WHERE assessment_attempts.user_id = EXCLUDED.user_id AND assessment_attempts.status = 'in_progress'`,
    [session.attemptId, request.user!.userId, session.settings.mode, JSON.stringify(session.settings),
      session.questionIds, JSON.stringify(data.responses), JSON.stringify(data.flagged), data.currentIndex,
      data.timeRemaining, data.screen],
  );
  response.status(204).end();
});

router.get('/latest', async (request: AuthenticatedRequest, response) => {
  const result = await pool.query<{
    id: string; mode: string; settings: SessionSettings; question_ids: string[];
    responses: unknown; flagged: Record<string, boolean>; current_index: number;
    time_remaining: number; screen: 'assessment' | 'review'; updated_at: string;
  }>(
    `SELECT id, mode, settings, question_ids, responses, flagged, current_index,
            time_remaining, screen, updated_at
     FROM assessment_attempts
     WHERE user_id = $1 AND status = 'in_progress'
     ORDER BY updated_at DESC LIMIT 1`,
    [request.user!.userId],
  );
  const attempt = result.rows[0];
  if (!attempt) {
    response.status(204).end();
    return;
  }
  const questions = await getQuestionsByIds(attempt.question_ids);
  const storedResponses = Array.isArray(attempt.responses)
    ? Object.fromEntries((attempt.responses as Array<{ itemId?: string }>).filter((item) => item.itemId).map((item) => [item.itemId!, item]))
    : attempt.responses;
  response.json({
    attempt: {
      attemptId: attempt.id,
      settings: attempt.settings,
      questions: questions.map(toCandidateQuestion),
      responses: storedResponses,
      flagged: attempt.flagged,
      currentIndex: attempt.current_index,
      timeRemaining: attempt.time_remaining,
      screen: attempt.screen,
      updatedAt: attempt.updated_at,
      sessionToken: signSessionToken(attempt.id, attempt.question_ids, attempt.settings),
    },
  });
});

router.delete('/:attemptId', async (request: AuthenticatedRequest, response) => {
  await pool.query('DELETE FROM assessment_attempts WHERE id = $1 AND user_id = $2', [request.params.attemptId, request.user!.userId]);
  response.status(204).end();
});

export default router;

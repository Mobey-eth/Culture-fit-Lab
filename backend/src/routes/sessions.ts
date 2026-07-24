import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { signSessionToken, verifySessionToken } from '../auth/tokens.js';
import { optionalAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { pool } from '../db.js';
import { getAllQuestions, getQuestionsByIds, toCandidateQuestion } from '../repository/questions.js';
import { sampleBalancedQuestions } from '../services/sampling.js';
import { scoreAssessment } from '../services/scoring.js';
import type { AssessmentResponse, FeedbackTiming, PracticeMode, SessionSettings } from '../types.js';

const router = Router();
const letters = z.enum(['A', 'B', 'C', 'D']);
const responseSchema = z.object({
  attemptId: z.string().uuid(),
  itemId: z.string().min(1),
  responseMode: z.enum(['most_least_3', 'first_second_3', 'sjt_best_worst_4']),
  mostResponse: letters.nullable(),
  leastResponse: letters.nullable(),
  secondResponse: z.enum(['A', 'B', 'C']).nullable(),
  flagged: z.boolean(),
  responseTimeMs: z.number().int().nonnegative(),
  answeredAt: z.string(),
});

const createSchema = z.object({
  mode: z.enum(['guided', 'serious', 'full', 'custom', 'retry']),
  count: z.number().int().min(1).max(200).optional(),
  timerSeconds: z.number().int().min(60).max(7200).nullable().optional(),
  feedbackTiming: z.enum(['immediate', 'after']).optional(),
  assistanceEnabled: z.boolean().optional(),
  itemIds: z.array(z.string()).min(1).max(200).optional(),
});

function settingsFor(input: z.infer<typeof createSchema>, bankSize: number): SessionSettings {
  if (input.mode === 'guided') {
    return { mode: 'guided', count: 20, timerSeconds: null, feedbackTiming: 'immediate', assistanceEnabled: true };
  }
  if (input.mode === 'serious') {
    return { mode: 'serious', count: 60, timerSeconds: 20 * 60, feedbackTiming: 'after', assistanceEnabled: false };
  }
  if (input.mode === 'full') {
    return {
      mode: 'full', count: bankSize, timerSeconds: input.timerSeconds ?? null,
      feedbackTiming: input.feedbackTiming ?? 'after', assistanceEnabled: false,
    };
  }
  return {
    mode: input.mode as PracticeMode,
    count: input.mode === 'retry' ? (input.itemIds?.length ?? 1) : (input.count ?? 20),
    timerSeconds: input.timerSeconds ?? null,
    feedbackTiming: (input.feedbackTiming ?? 'after') as FeedbackTiming,
    assistanceEnabled: input.assistanceEnabled ?? false,
  };
}

router.post('/', async (request, response) => {
  const input = createSchema.parse(request.body);
  const allQuestions = await getAllQuestions();
  const settings = settingsFor(input, allQuestions.length);
  const questions = input.mode === 'retry' && input.itemIds
    ? await getQuestionsByIds(input.itemIds)
    : sampleBalancedQuestions(allQuestions, settings.count, randomUUID());
  if (!questions.length) {
    response.status(503).json({ error: 'The question bank is not ready yet.' });
    return;
  }
  const attemptId = randomUUID();
  const questionIds = questions.map((question) => question.item_id);
  response.status(201).json({
    attemptId,
    sessionToken: signSessionToken(attemptId, questionIds, { ...settings, count: questions.length }),
    settings: { ...settings, count: questions.length },
    questions: questions.map(toCandidateQuestion),
  });
});

router.post('/score', optionalAuth, async (request: AuthenticatedRequest, response) => {
  const data = z.object({
    sessionToken: z.string().min(1),
    responses: z.array(responseSchema).max(200),
  }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  const [questions, catalog] = await Promise.all([
    getQuestionsByIds(session.questionIds),
    getAllQuestions(),
  ]);
  const allowed = new Set(session.questionIds);
  const responses = data.responses.filter((item) => item.attemptId === session.attemptId && allowed.has(item.itemId)) as AssessmentResponse[];
  const result = scoreAssessment(session.attemptId, questions, catalog, responses);

  if (request.user) {
    await pool.query(
      `INSERT INTO assessment_attempts
       (id, user_id, mode, settings, question_ids, responses, status, results, completed_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6::jsonb, 'completed', $7::jsonb, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         responses = EXCLUDED.responses, status = 'completed', results = EXCLUDED.results,
         completed_at = now(), updated_at = now()
       WHERE assessment_attempts.user_id = EXCLUDED.user_id`,
      [session.attemptId, request.user.userId, session.settings.mode, JSON.stringify(session.settings),
        session.questionIds, JSON.stringify(responses), JSON.stringify(result)],
    );
  }
  response.json({ result });
});

export { responseSchema };
export default router;

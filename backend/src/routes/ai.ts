import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { verifySessionToken } from '../auth/tokens.js';
import { pool } from '../db.js';
import { getAllQuestions, getQuestionById, getQuestionsByIds, toCandidateQuestion } from '../repository/questions.js';
import { createCoaching, createCoachReply, createHint } from '../services/deepseek.js';
import { selectPracticeCandidates } from '../services/practiceRecommendations.js';
import { scoreAssessment } from '../services/scoring.js';
import { responseSchema } from './sessions.js';
import type { AssessmentResponse, CoachingMessage, SessionClaims } from '../types.js';

const router = Router();
const aiLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
router.use(aiLimiter);

const assessmentPayloadSchema = z.object({
  sessionToken: z.string().min(1),
  responses: z.array(responseSchema).max(200),
});

function allowedResponses(session: SessionClaims, responses: AssessmentResponse[]) {
  const allowed = new Set(session.questionIds);
  return responses.filter((item) => item.attemptId === session.attemptId && allowed.has(item.itemId));
}

async function ensureCompletedAttempt(
  request: AuthenticatedRequest,
  session: SessionClaims,
  responses: AssessmentResponse[],
  result: unknown,
) {
  await pool.query(
    `INSERT INTO assessment_attempts
      (id, user_id, mode, settings, question_ids, responses, status, results, completed_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6::jsonb, 'completed', $7::jsonb, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       responses = EXCLUDED.responses, status = 'completed', results = EXCLUDED.results,
       completed_at = COALESCE(assessment_attempts.completed_at, now()), updated_at = now()
     WHERE assessment_attempts.user_id = EXCLUDED.user_id`,
    [session.attemptId, request.user!.userId, session.settings.mode, JSON.stringify(session.settings),
      session.questionIds, JSON.stringify(responses), JSON.stringify(result)],
  );
}

type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: {
    nextSteps?: string[];
    recommendations?: Array<{ itemId: string; reason: string }>;
  } | null;
  created_at: Date | string;
};

function toCoachingMessage(row: MessageRow): CoachingMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    nextSteps: Array.isArray(row.metadata?.nextSteps) ? row.metadata!.nextSteps! : [],
    recommendations: Array.isArray(row.metadata?.recommendations) ? row.metadata!.recommendations! : [],
  };
}

router.post('/hint', async (request, response) => {
  const data = z.object({
    sessionToken: z.string().min(1),
    itemId: z.string().min(1),
    previousHints: z.array(z.object({
      title: z.string().min(1).max(80),
      guidance: z.string().min(1).max(700),
    })).max(5).default([]),
  }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  if (!session.settings.assistanceEnabled || session.settings.mode === 'serious') {
    response.status(403).json({ error: 'Hints are disabled for this session.' });
    return;
  }
  if (!session.questionIds.includes(data.itemId)) {
    response.status(400).json({ error: 'That item is not part of this session.' });
    return;
  }
  const question = await getQuestionById(data.itemId);
  if (!question) {
    response.status(404).json({ error: 'Question not found.' });
    return;
  }
  response.json({ hint: await createHint(toCandidateQuestion(question), session.attemptId, data.previousHints) });
});

router.post('/analyze', optionalAuth, async (request: AuthenticatedRequest, response) => {
  const data = assessmentPayloadSchema.parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  const [questions, catalog] = await Promise.all([getQuestionsByIds(session.questionIds), getAllQuestions()]);
  const responses = allowedResponses(session, data.responses as AssessmentResponse[]);
  const result = scoreAssessment(session.attemptId, questions, catalog, responses);
  const coaching = await createCoaching(result);
  if (request.user) {
    await ensureCompletedAttempt(request, session, responses, result);
    await pool.query('UPDATE assessment_attempts SET ai_coaching = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(coaching), session.attemptId, request.user.userId]);
  }
  response.json({ coaching });
});

router.post('/coach/history', requireAuth, async (request: AuthenticatedRequest, response) => {
  const data = z.object({ sessionToken: z.string().min(1) }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  const owner = await pool.query('SELECT 1 FROM assessment_attempts WHERE id = $1 AND user_id = $2',
    [session.attemptId, request.user!.userId]);
  if (!owner.rowCount) {
    response.json({ messages: [] });
    return;
  }
  const result = await pool.query<MessageRow>(
    `SELECT id, role, content, metadata, created_at FROM (
       SELECT id, role, content, metadata, created_at
       FROM result_coaching_messages
       WHERE attempt_id = $1 AND user_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 30
     ) recent ORDER BY created_at, id`,
    [session.attemptId, request.user!.userId],
  );
  const messages = result.rows.map(toCoachingMessage);
  const latestRecommendations = [...messages].reverse().find((message) => message.recommendations.length)?.recommendations ?? [];
  const recommendedRows = await getQuestionsByIds(latestRecommendations.map((item) => item.itemId));
  const reasonById = new Map(latestRecommendations.map((item) => [item.itemId, item.reason]));
  response.json({
    messages,
    recommendedQuestions: recommendedRows.map((question) => ({
      ...toCandidateQuestion(question),
      competency: question.primary_competency,
      reason: reasonById.get(question.item_id) ?? 'A useful follow-up for this coaching conversation.',
    })),
  });
});

router.post('/coach/chat', requireAuth, async (request: AuthenticatedRequest, response) => {
  const data = assessmentPayloadSchema.extend({
    message: z.string().trim().min(2).max(1500),
  }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  const [questions, catalog, stored] = await Promise.all([
    getQuestionsByIds(session.questionIds),
    getAllQuestions(),
    pool.query<MessageRow>(
      `SELECT id, role, content, metadata, created_at FROM (
         SELECT id, role, content, metadata, created_at
         FROM result_coaching_messages
         WHERE attempt_id = $1 AND user_id = $2
         ORDER BY created_at DESC, id DESC LIMIT 20
       ) recent ORDER BY created_at, id`,
      [session.attemptId, request.user!.userId],
    ),
  ]);
  const responses = allowedResponses(session, data.responses as AssessmentResponse[]);
  const result = scoreAssessment(session.attemptId, questions, catalog, responses);
  await ensureCompletedAttempt(request, session, responses, result);

  const history = stored.rows.map(toCoachingMessage);
  const candidates = selectPracticeCandidates(catalog, result, data.message, session.questionIds);
  const reply = await createCoachReply(result, history, data.message, candidates, session.attemptId);
  if (!reply.recommendations.length && candidates.length) {
    reply.recommendations = candidates.slice(0, 2).map((candidate) => ({
      itemId: candidate.itemId,
      reason: `This gives you another ${candidate.competency.toLowerCase()} situation to reflect on without repeating the same wording.`,
    }));
  }

  const turnCreatedAt = Date.now();
  const userMessage: CoachingMessage = {
    id: randomUUID(), role: 'user', content: data.message, createdAt: new Date(turnCreatedAt).toISOString(),
    nextSteps: [], recommendations: [],
  };
  const assistantMessage: CoachingMessage = {
    id: randomUUID(), role: 'assistant', content: reply.reply, createdAt: new Date(turnCreatedAt + 1).toISOString(),
    nextSteps: reply.nextSteps, recommendations: reply.recommendations,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO result_coaching_messages (id, attempt_id, user_id, role, content, metadata, created_at)
       VALUES ($1, $2, $3, 'user', $4, '{}'::jsonb, $5)`,
      [userMessage.id, session.attemptId, request.user!.userId, userMessage.content, userMessage.createdAt],
    );
    await client.query(
      `INSERT INTO result_coaching_messages (id, attempt_id, user_id, role, content, metadata, created_at)
       VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb, $6)`,
      [assistantMessage.id, session.attemptId, request.user!.userId, assistantMessage.content,
        JSON.stringify({ nextSteps: assistantMessage.nextSteps, recommendations: assistantMessage.recommendations,
          acknowledgedCorrection: reply.acknowledgedCorrection }), assistantMessage.createdAt],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const byId = new Map(candidates.map((candidate) => [candidate.itemId, candidate]));
  const recommendedQuestions = reply.recommendations.flatMap((recommendation) => {
    const candidate = byId.get(recommendation.itemId);
    if (!candidate) return [];
    return [{
      itemId: candidate.itemId,
      itemType: candidate.itemType,
      responseMode: candidate.responseMode,
      instruction: candidate.instruction,
      stem: candidate.stem,
      options: candidate.options,
      competency: candidate.competency,
      reason: recommendation.reason,
    }];
  });
  response.json({ userMessage, assistantMessage, recommendedQuestions });
});

export default router;

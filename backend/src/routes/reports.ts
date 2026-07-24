import { Router } from 'express';
import { z } from 'zod';
import { verifySessionToken } from '../auth/tokens.js';
import { getAllQuestions, getQuestionsByIds } from '../repository/questions.js';
import { coachingSchemaForReport } from './reportSchemas.js';
import { createPdfReport } from '../services/pdfReport.js';
import { scoreAssessment } from '../services/scoring.js';
import { responseSchema } from './sessions.js';
import type { AssessmentResponse } from '../types.js';

const router = Router();

router.post('/pdf', async (request, response) => {
  const data = z.object({
    sessionToken: z.string().min(1),
    responses: z.array(responseSchema).max(200),
    coaching: coachingSchemaForReport.optional(),
  }).parse(request.body);
  const session = verifySessionToken(data.sessionToken);
  const [questions, catalog] = await Promise.all([getQuestionsByIds(session.questionIds), getAllQuestions()]);
  const result = scoreAssessment(session.attemptId, questions, catalog, data.responses as AssessmentResponse[]);
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="culturefit-report-${session.attemptId.slice(0, 8)}.pdf"`);
  createPdfReport(result, data.coaching).pipe(response);
});

export default router;

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool } from './db.js';
import aiRoutes from './routes/ai.js';
import attemptRoutes from './routes/attempts.js';
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import sessionRoutes from './routes/sessions.js';

export const app = express();

app.disable('x-powered-by');
if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_request, response) => {
  const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM question_bank');
  response.json({ status: 'ok', questionCount: Number(result.rows[0]?.count ?? 0), model: config.DEEPSEEK_MODEL });
});
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const fieldNames: Record<string, string> = {
      username: 'Username',
      email: 'Email',
      password: 'Password',
      newPassword: 'New password',
      recoveryQuestion: 'Recovery question',
      recoveryAnswer: 'Recovery answer',
    };
    const field = typeof firstIssue?.path[0] === 'string' ? fieldNames[firstIssue.path[0]] : undefined;
    const issueMessage = firstIssue?.path[0] === 'recoveryQuestion'
      ? 'Choose one of the available questions.'
      : firstIssue?.message ?? 'Please check the submitted fields.';
    response.status(400).json({
      error: field ? `${field}: ${issueMessage}` : issueMessage,
      details: error.issues,
    });
    return;
  }
  if (error instanceof Error && /assessment session|jwt|token/i.test(error.message)) {
    response.status(401).json({ error: 'This assessment session has expired. Start or resume an attempt.' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Something went wrong. Please try again.' });
});

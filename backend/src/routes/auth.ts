import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { optionalAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { recoveryQuestions } from '../auth/recoveryQuestions.js';
import { signAuthToken } from '../auth/tokens.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });

const usernameSchema = z.string().trim().min(3, 'Use at least 3 characters.').max(30)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*[a-zA-Z0-9]$/, 'Use letters, numbers, dots, underscores or hyphens.')
  .transform((value) => value.toLowerCase());
const identifierSchema = z.string().trim().min(3).max(254).transform((value) => value.toLowerCase());
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const optionalEmailSchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  emailSchema.optional(),
).transform((value) => value ?? null);
export const passwordSchema = z.string().min(5, 'Use at least 5 characters.').max(128);
export const registerSchema = z.object({
  username: usernameSchema,
  email: optionalEmailSchema,
  password: passwordSchema,
  recoveryQuestion: z.enum(recoveryQuestions),
  recoveryAnswer: z.string().trim().min(3).max(180),
});
const loginSchema = z.object({ username: identifierSchema, password: z.string().min(1).max(128) });

type AuthUser = { id: string; username: string; email: string | null; role: string };
type AuthUserWithPassword = AuthUser & { password_hash: string };

function setAuthCookie(response: Parameters<typeof signInResponse>[0], token: string) {
  response.cookie('culturefit_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function signInResponse(response: import('express').Response, user: AuthUser) {
  setAuthCookie(response, signAuthToken({
    userId: user.id, username: user.username, email: user.email, role: user.role,
  }));
  response.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}

async function findByIdentifier(identifier: string) {
  const result = await pool.query<AuthUserWithPassword & { recovery_question: string; recovery_answer_hash: string }>(
    `SELECT id, username, email, role, password_hash, recovery_question, recovery_answer_hash
     FROM app_users
     WHERE lower(username) = $1 OR lower(coalesce(email, '')) = $1
     LIMIT 1`,
    [identifier],
  );
  return result.rows[0];
}

router.use(authLimiter);

router.post('/register', async (request, response) => {
  const data = registerSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const recoveryAnswerHash = await bcrypt.hash(data.recoveryAnswer.toLocaleLowerCase(), 12);
  try {
    const result = await pool.query<AuthUser>(
      `INSERT INTO app_users (id, username, email, password_hash, recovery_question, recovery_answer_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, role`,
      [randomUUID(), data.username, data.email, passwordHash, data.recoveryQuestion, recoveryAnswerHash],
    );
    signInResponse(response, result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const constraint = (error as { constraint?: string }).constraint ?? '';
      response.status(409).json({ error: constraint.includes('email')
        ? 'An account already uses that email.'
        : 'That username is already taken.' });
      return;
    }
    throw error;
  }
});

router.post('/login', async (request, response) => {
  const data = loginSchema.parse(request.body);
  const user = await findByIdentifier(data.username);
  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
    response.status(401).json({ error: 'Username or password is incorrect.' });
    return;
  }
  signInResponse(response, user);
});

router.post('/logout', (_request, response) => {
  response.clearCookie('culturefit_auth', { path: '/' });
  response.status(204).end();
});

router.get('/me', optionalAuth, (request: AuthenticatedRequest, response) => {
  response.json({ user: request.user ?? null });
});

router.post('/recovery/challenge', async (request, response) => {
  const username = z.object({ username: identifierSchema }).parse(request.body).username;
  const user = await findByIdentifier(username);
  if (!user) {
    response.status(404).json({ error: 'No account was found for that username.' });
    return;
  }
  response.json({ question: user.recovery_question });
});

router.post('/recovery/reset', async (request, response) => {
  const data = z.object({
    username: identifierSchema,
    recoveryAnswer: z.string().trim().min(1).max(180),
    newPassword: passwordSchema,
  }).parse(request.body);
  const user = await findByIdentifier(data.username);
  if (!user || !(await bcrypt.compare(data.recoveryAnswer.toLocaleLowerCase(), user.recovery_answer_hash))) {
    response.status(401).json({ error: 'The recovery answer did not match.' });
    return;
  }
  await pool.query(
    'UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [await bcrypt.hash(data.newPassword, 12), user.id],
  );
  response.json({ message: 'Password updated. You can sign in now.' });
});

export default router;

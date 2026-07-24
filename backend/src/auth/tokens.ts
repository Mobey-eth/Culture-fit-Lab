import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { SessionClaims, SessionSettings } from '../types.js';

export type AuthClaims = {
  kind: 'auth';
  userId: string;
  username?: string;
  email?: string | null;
  role: string;
};

export function signAuthToken(claims: Omit<AuthClaims, 'kind'>) {
  return jwt.sign({ ...claims, kind: 'auth' }, config.JWT_SECRET, { expiresIn: '14d' });
}

export function verifyAuthToken(token: string) {
  const claims = jwt.verify(token, config.JWT_SECRET) as AuthClaims;
  if (claims.kind !== 'auth') throw new Error('Invalid authentication token');
  return claims;
}

export function signSessionToken(attemptId: string, questionIds: string[], settings: SessionSettings) {
  const claims: SessionClaims = { kind: 'assessment-session', attemptId, questionIds, settings };
  return jwt.sign(claims, config.SESSION_SECRET, { expiresIn: '3d' });
}

export function verifySessionToken(token: string) {
  const claims = jwt.verify(token, config.SESSION_SECRET) as SessionClaims;
  if (claims.kind !== 'assessment-session') throw new Error('Invalid assessment session');
  return claims;
}

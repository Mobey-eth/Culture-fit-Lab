import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, type AuthClaims } from './tokens.js';

export type AuthenticatedRequest = Request & { user?: AuthClaims };

export function optionalAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const token = request.cookies?.culturefit_auth as string | undefined;
  if (token) {
    try {
      request.user = verifyAuthToken(token);
    } catch {
      request.user = undefined;
    }
  }
  next();
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  optionalAuth(request, response, () => {
    if (!request.user) {
      response.status(401).json({ error: 'Sign in to use cloud progress.' });
      return;
    }
    next();
  });
}

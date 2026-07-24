import { describe, expect, it } from 'vitest';
import { recoveryQuestions } from '../src/auth/recoveryQuestions.js';
import { registerSchema } from '../src/routes/auth.js';

describe('account recovery choices', () => {
  it('offers ten distinct preset questions', () => {
    expect(recoveryQuestions).toHaveLength(10);
    expect(new Set(recoveryQuestions).size).toBe(10);
    expect(recoveryQuestions).toContain('What was the name of your first pet?');
    expect(recoveryQuestions).toContain('What is your favorite TV show or movie?');
  });
});

describe('account validation', () => {
  const validSignup = {
    username: 'Moby',
    email: '',
    password: 'whale1',
    recoveryQuestion: 'What is your favorite drink?',
    recoveryAnswer: 'water',
  };

  it('accepts a signup with a password of five or more characters', () => {
    expect(registerSchema.safeParse(validSignup).success).toBe(true);
    expect(registerSchema.safeParse({ ...validSignup, password: 'abcde' }).success).toBe(true);
  });

  it('accepts signup when the optional email field is blank or omitted', () => {
    const { email: _email, ...withoutEmail } = validSignup;
    const omitted = registerSchema.safeParse(withoutEmail);
    const blank = registerSchema.safeParse(validSignup);

    expect(omitted.success).toBe(true);
    expect(blank.success).toBe(true);
    if (omitted.success) expect(omitted.data.email).toBeNull();
    if (blank.success) expect(blank.data.email).toBeNull();
  });

  it('rejects passwords shorter than five characters', () => {
    const result = registerSchema.safeParse({ ...validSignup, password: 'abcd' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Use at least 5 characters.');
  });
});

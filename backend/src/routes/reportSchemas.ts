import { z } from 'zod';

export const coachingSchemaForReport = z.object({
  summary: z.string().max(1200),
  strengths: z.array(z.string().max(350)).max(5),
  coachingTips: z.array(z.string().max(450)).max(6),
  consistencyCoaching: z.string().max(900),
  practicePlan: z.array(z.string().max(350)).max(5),
});

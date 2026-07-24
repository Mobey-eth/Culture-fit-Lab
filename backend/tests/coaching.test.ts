import { describe, expect, it } from 'vitest';
import { buildCoachPayload, MODEL_WRITING_RULE, normaliseModelPunctuation } from '../src/services/deepseek.js';
import { selectPracticeCandidates } from '../src/services/practiceRecommendations.js';
import type { AssessmentResult, CoachingMessage, QuestionRow } from '../src/types.js';
import { makeQuestion } from './fixtures.js';

function resultFixture(): AssessmentResult {
  return {
    attemptId: '00000000-0000-4000-8000-000000000001',
    completedAt: new Date(0).toISOString(),
    completion: { answered: 20, total: 20, percentage: 100 },
    competencies: [
      { code: 'C10', name: 'Team-first collaboration', score: 76, rawScore: 4, opportunities: 3, band: 'strong', bandLabel: 'Strong tendency' },
      { code: 'C13', name: 'Constructive feedback and difficult conversations', score: 38, rawScore: -2, opportunities: 3, band: 'developing', bandLabel: 'Less evident' },
    ],
    strongest: [{ code: 'C10', name: 'Team-first collaboration', score: 76, rawScore: 4, opportunities: 3, band: 'strong', bandLabel: 'Strong tendency' }],
    balanced: [], possibleOveruse: [],
    consistency: { percentage: 72, label: 'Moderate', evaluatedClusters: 8, lowClusters: ['C13'], possibleOvercorrection: false, note: 'Variation is normal.' },
    scenarioJudgment: { score: 9, maximum: 12, percentage: 75, weakestChoiceAligned: 2, total: 3 },
    scenarioReview: [],
    focusAreas: [{
      id: 'growth-C13', kind: 'growth', competencyCode: 'C13', title: 'Build clearer evidence for difficult conversations',
      guidance: 'Use a recent example.', questions: [{ itemId: 'old-C13', number: 7 }],
    }],
    profileAlignment: 68,
    disclaimer: 'Practice only.',
  };
}

function catalogFixture() {
  const rows: QuestionRow[] = [];
  for (const [code, name] of [['C10', 'Team-first collaboration'], ['C13', 'Constructive feedback and difficult conversations']] as const) {
    for (let index = 0; index < 5; index += 1) {
      const mode = index === 4 ? 'sjt_best_worst_4' : index === 3 ? 'first_second_3' : 'most_least_3';
      const row = makeQuestion(`${code}-${index}`, code, mode);
      row.primary_competency = name;
      row.variant = index === 1 ? 'Reverse check' : index === 2 ? 'Context shift' : row.variant;
      row.reverse_keyed = index === 1;
      row.related_item_ids = Array.from({ length: 5 }, (_, item) => `${code}-${item}`);
      rows.push(row);
    }
  }
  return rows;
}

describe('results coaching retrieval', () => {
  it('prioritizes database questions that match the learner’s stated development goal', () => {
    const candidates = selectPracticeCandidates(
      catalogFixture(), resultFixture(), 'I want to improve difficult conversations and speak up sooner.', ['C13-0'], 6,
    );

    expect(candidates[0].competencyCode).toBe('C13');
    expect(candidates.filter((item) => item.competencyCode === 'C13').length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]).not.toHaveProperty('profile_priority');
    expect(candidates[0]).not.toHaveProperty('option_a_key');
  });

  it('sends corrections, deterministic results, and only candidate-facing practice text to the model', () => {
    const history: CoachingMessage[] = [{
      id: 'message-1', role: 'assistant', content: 'You may avoid conflict.', createdAt: new Date(0).toISOString(),
      nextSteps: [], recommendations: [],
    }];
    const candidates = selectPracticeCandidates(catalogFixture(), resultFixture(), 'That assumption is wrong.', [], 4);
    const payload = buildCoachPayload(resultFixture(), history, 'That assumption is wrong; I address issues after checking facts.', candidates);

    expect(payload.learnerMessage).toContain('assumption is wrong');
    expect(payload.conversation[0]).toEqual({ role: 'assistant', content: 'You may avoid conflict.' });
    expect(payload.deterministicProfile.competencies.find((item) => item.code === 'C13')?.score).toBe(38);
    expect(payload.candidatePracticePool[0]).not.toHaveProperty('reverseKeyed');
    expect(payload.candidatePracticePool[0]).not.toHaveProperty('key');
    expect(payload.outputRules.join(' ')).toContain('acknowledge the correction');
    expect(payload.outputRules).toContain(MODEL_WRITING_RULE);
  });

  it('removes em dashes from every model-generated text field', () => {
    const value = normaliseModelPunctuation({
      reply: 'The result suggested one pattern—but your context changes the interpretation.',
      nextSteps: ['Pause—then use a recent example.'],
    });

    expect(JSON.stringify(value)).not.toContain('—');
    expect(value.reply).toBe('The result suggested one pattern, but your context changes the interpretation.');
  });
});

import { describe, expect, it } from 'vitest';
import { scoreAssessment } from '../src/services/scoring.js';
import type { AssessmentResponse } from '../src/types.js';
import { makeQuestion } from './fixtures.js';

function response(itemId: string, most: 'A' | 'B' | 'C' | 'D', least: 'A' | 'B' | 'C' | 'D'): AssessmentResponse {
  return {
    attemptId: '00000000-0000-4000-8000-000000000000', itemId,
    responseMode: 'most_least_3', mostResponse: most, leastResponse: least, secondResponse: null,
    flagged: false, responseTimeMs: 1000, answeredAt: new Date().toISOString(),
  };
}

describe('deterministic scoring', () => {
  it('honors negative option keys on reverse-keyed items', () => {
    const direct = makeQuestion('direct', 'C01', 'most_least_3');
    const reverse = { ...makeQuestion('reverse', 'C01', 'most_least_3'), reverse_keyed: true, option_a_key: -1, variant: 'Reverse' };
    const result = scoreAssessment(
      '00000000-0000-4000-8000-000000000000', [direct, reverse], [direct],
      [response('direct', 'A', 'B'), response('reverse', 'B', 'A')],
    );
    const competency = result.competencies.find((item) => item.code === 'C01');
    expect(competency?.rawScore).toBe(3);
    expect(competency?.score).toBe(88);
    expect(result.consistency.label).toBe('High');
  });

  it('keeps scenario effectiveness separate from personality tendencies', () => {
    const scenario = makeQuestion('scenario', 'C01', 'sjt_best_worst_4');
    const result = scoreAssessment(
      '00000000-0000-4000-8000-000000000000', [scenario], [scenario],
      [{ ...response('scenario', 'A', 'D'), responseMode: 'sjt_best_worst_4' }],
    );
    expect(result.scenarioJudgment).toMatchObject({ score: 4, maximum: 4, percentage: 100, weakestChoiceAligned: 1 });
    expect(result.competencies[0].opportunities).toBe(0);
  });

  it('requires repeated evidence for a very-high balance review and adds question pointers', () => {
    const first = makeQuestion('very-high-1', 'C01', 'most_least_3');
    const second = makeQuestion('very-high-2', 'C01', 'most_least_3');
    const single = scoreAssessment(
      '00000000-0000-4000-8000-000000000000', [first], [first],
      [response('very-high-1', 'A', 'B')],
    );
    expect(single.possibleOveruse.map((entry) => entry.code)).not.toContain('C01');

    const result = scoreAssessment(
      '00000000-0000-4000-8000-000000000000', [first, second], [first],
      [response('very-high-1', 'A', 'B'), response('very-high-2', 'A', 'B')],
    );

    expect(result.possibleOveruse.map((entry) => entry.code)).toContain('C01');
    expect(result.strongest.map((entry) => entry.code)).not.toContain('C01');
    expect(result.focusAreas.find((area) => area.id === 'balance-C01')?.questions)
      .toEqual([{ itemId: 'very-high-1', number: 1 }, { itemId: 'very-high-2', number: 2 }]);
  });
});

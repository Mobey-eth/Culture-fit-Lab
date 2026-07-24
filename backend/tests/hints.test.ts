import { describe, expect, it } from 'vitest';
import { buildHintPayload, MODEL_WRITING_RULE } from '../src/services/deepseek.js';
import type { CandidateQuestion } from '../src/types.js';

const question: CandidateQuestion = {
  itemId: 'JFA-test',
  itemType: 'Work style',
  responseMode: 'most_least_3',
  instruction: 'Choose one MOST and one LEAST.',
  stem: 'Which statements describe how you work?',
  options: [
    { letter: 'A', text: 'I resolve a customer issue before it grows.' },
    { letter: 'B', text: 'I adopt a new process without losing sight of the required result.' },
    { letter: 'C', text: 'I consider long-term organizational impact when making a local decision.' },
  ],
};

describe('AI hint context', () => {
  it('sends the complete current item and recent hints to the model', () => {
    const previous = [{ title: 'Old title', guidance: 'Old generic guidance' }];
    const payload = buildHintPayload(question, previous);

    expect(payload.currentQuestion).toMatchObject({
      itemId: 'JFA-test',
      stem: question.stem,
      choices: question.options,
    });
    expect(payload.recentHintsToAvoidRepeating).toEqual(previous);
    expect(payload.requirements.join(' ')).toContain('strong answer');
    expect(payload.requirements.join(' ')).toContain('weak answer');
    expect(payload.requirements).toContain(MODEL_WRITING_RULE);
  });

  it('limits repetition context to the five most recent hints', () => {
    const previous = Array.from({ length: 7 }, (_, index) => ({
      title: `Hint ${index}`,
      guidance: `Guidance ${index}`,
    }));

    expect(buildHintPayload(question, previous).recentHintsToAvoidRepeating.map((hint) => hint.title))
      .toEqual(['Hint 2', 'Hint 3', 'Hint 4', 'Hint 5', 'Hint 6']);
  });
});

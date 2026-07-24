import { describe, expect, it } from 'vitest';
import { createPdfReport } from '../src/services/pdfReport.js';
import type { Coaching } from '../src/services/deepseek.js';
import type { AssessmentResult, CompetencyScore, FocusArea } from '../src/types.js';

function baseResult(): AssessmentResult {
  return {
    attemptId: '00000000-0000-4000-8000-000000000099',
    completedAt: new Date(0).toISOString(),
    completion: { answered: 60, total: 60, percentage: 100 },
    competencies: [], strongest: [], balanced: [], possibleOveruse: [],
    consistency: {
      percentage: 74, label: 'Moderate', evaluatedClusters: 12, lowClusters: ['C04'],
      possibleOvercorrection: false, note: 'Most repeated areas pointed in a similar direction.',
    },
    scenarioJudgment: { score: 34, maximum: 48, percentage: 71, weakestChoiceAligned: 8, total: 12 },
    scenarioReview: [], focusAreas: [], profileAlignment: 68,
    disclaimer: 'Work-style results describe response tendencies, not objectively correct or incorrect personality answers. Scenario judgment is scored separately.',
  };
}

function collectReport() {
  const base = baseResult();
  const bands: CompetencyScore['band'][] = ['strong', 'balanced', 'possible_overuse', 'developing'];
  base.competencies = Array.from({ length: 24 }, (_, index) => ({
    code: `C${String(index + 1).padStart(2, '0')}`,
    name: index % 5 === 0
      ? `Long competency name ${index + 1} for testing readable text and safe chart labels`
      : `Competency cluster ${index + 1}`,
    score: 32 + ((index * 11) % 67),
    rawScore: index - 8,
    opportunities: index > 20 ? 0 : 3 + (index % 4),
    band: index > 20 ? 'not_sampled' : bands[index % bands.length],
    bandLabel: index > 20 ? 'Not sampled' : 'Measured pattern',
  }));
  const focusAreas: FocusArea[] = Array.from({ length: 5 }, (_, index) => ({
    id: `focus-${index}`,
    kind: (['scenario', 'balance', 'growth', 'reflection', 'growth'] as const)[index],
    competencyCode: `C${String(index + 1).padStart(2, '0')}`,
    title: `A specific area to review in your next practice session ${index + 1}`,
    guidance: 'This deliberately long paragraph checks that guidance wraps into measured lines without colliding with the title, question pointer, or the next section. Use one recent workplace example before answering again.',
    questions: [{ itemId: `item-${index}`, number: index + 3 }, { itemId: `item-${index}-b`, number: index + 11 }],
  }));
  base.focusAreas = focusAreas;
  const coaching: Coaching = {
    summary: 'Your results show useful strengths and a few clear places to slow down and practise with recent examples.',
    strengths: ['You kept teamwork visible across several related questions.', 'You showed reliable follow-through in the scenarios.'],
    coachingTips: [
      'Use one ordinary work week as your reference point when questions repeat a similar tension.',
      'Review the question pointers in this report and explain your choice aloud before trying again.',
      'Practise choosing a direct and proportionate action when a scenario contains delay or avoidable escalation.',
    ],
    consistencyCoaching: 'Keep the same timeframe and definition of usual behaviour across related questions. Change an answer only when the situation meaningfully changes.',
    practicePlan: ['Review the two lowest signals.', 'Retry the linked questions.', 'Compare the next report with this one.'],
  };
  return { result: base, coaching };
}

function toBuffer(result: ReturnType<typeof collectReport>['result'], coaching: Coaching) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const report = createPdfReport(result, coaching);
    report.on('data', (chunk: Buffer) => chunks.push(chunk));
    report.on('end', () => resolve(Buffer.concat(chunks)));
    report.on('error', reject);
  });
}

describe('PDF report', () => {
  it('renders long content into a substantial multi-page report', async () => {
    const { result, coaching } = collectReport();
    const buffer = await toBuffer(result, coaching);
    const source = buffer.toString('latin1');
    const pages = source.match(/\/Type\s*\/Page\b/g) ?? [];

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(12_000);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(source).not.toContain('—');
  });
});

import { describe, expect, it } from 'vitest';
import { sampleBalancedQuestions } from '../src/services/sampling.js';
import type { QuestionRow, ResponseMode } from '../src/types.js';
import { makeQuestion } from './fixtures.js';

describe('balanced sampling', () => {
  function questionBank() {
    const questions: QuestionRow[] = [];
    for (let clusterIndex = 1; clusterIndex <= 24; clusterIndex += 1) {
      const cluster = `C${String(clusterIndex).padStart(2, '0')}`;
      const modes: ResponseMode[] = ['most_least_3', 'most_least_3', 'most_least_3', 'first_second_3', 'sjt_best_worst_4'];
      const clusterItems = modes.map((mode, index) => {
        const question = makeQuestion(`${cluster}-${index}`, cluster, mode);
        question.variant = index === 1 ? 'Reverse check'
          : index === 2 ? 'Context shift'
            : index === 3 ? 'Tradeoff and top two'
              : index === 4 ? 'Workplace scenario' : question.variant;
        question.reverse_keyed = index === 1;
        return question;
      });
      for (const question of clusterItems) question.related_item_ids = clusterItems.map((item) => item.item_id);
      questions.push(...clusterItems);
    }
    return questions;
  }

  it('builds a 60-item session with the requested mix and two items per cluster', () => {
    const sample = sampleBalancedQuestions(questionBank(), 60, 'fixed-test-seed');
    expect(sample).toHaveLength(60);
    expect(sample.filter((item) => item.response_mode === 'most_least_3')).toHaveLength(36);
    expect(sample.filter((item) => item.response_mode === 'first_second_3')).toHaveLength(12);
    expect(sample.filter((item) => item.response_mode === 'sjt_best_worst_4')).toHaveLength(12);
    for (let clusterIndex = 1; clusterIndex <= 24; clusterIndex += 1) {
      const cluster = `C${String(clusterIndex).padStart(2, '0')}`;
      expect(sample.filter((item) => item.consistency_cluster === cluster).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('pairs a 20-item drill within ten clusters so consistency can be estimated', () => {
    const sample = sampleBalancedQuestions(questionBank(), 20, 'guided-test-seed');
    const counts = new Map<string, number>();
    for (const item of sample) counts.set(item.consistency_cluster, (counts.get(item.consistency_cluster) ?? 0) + 1);

    expect(sample).toHaveLength(20);
    expect(counts.size).toBe(10);
    expect([...counts.values()]).toEqual(Array(10).fill(2));
    expect(sample.filter((item) => item.response_mode === 'most_least_3')).toHaveLength(12);
    expect(sample.filter((item) => item.response_mode === 'first_second_3')).toHaveLength(4);
    expect(sample.filter((item) => item.response_mode === 'sjt_best_worst_4')).toHaveLength(4);

    const positions = new Map<string, number[]>();
    sample.forEach((item, index) => positions.set(item.consistency_cluster, [...(positions.get(item.consistency_cluster) ?? []), index]));
    for (const clusterPositions of positions.values()) {
      expect(clusterPositions[1] - clusterPositions[0]).toBeGreaterThanOrEqual(8);
    }
    for (const cluster of counts.keys()) {
      const pair = sample.filter((item) => item.consistency_cluster === cluster);
      expect(pair.some((item) => item.related_item_ids.includes(pair.find((other) => other.item_id !== item.item_id)!.item_id))).toBe(true);
      expect(new Set(pair.map((item) => item.variant)).size).toBeGreaterThan(1);
    }
  });
});

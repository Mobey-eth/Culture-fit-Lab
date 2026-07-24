import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestionCsv } from '../src/services/csvQuestions.js';

describe('question CSV', () => {
  it('parses quoted fields and preserves the required mode counts', () => {
    const modes = [
      ...Array.from({ length: 72 }, () => 'most_least_3'),
      ...Array.from({ length: 24 }, () => 'first_second_3'),
      ...Array.from({ length: 24 }, () => 'sjt_best_worst_4'),
    ];
    const contents = ['item_id,response_mode,stem', ...modes.map((mode, index) => (
      `JFA${String(index + 1).padStart(3, '0')},${mode},"Quoted statement, number ${index + 1}, with ""detail"""`
    ))].join('\n');
    const rows = parseQuestionCsv(contents);

    expect(rows).toHaveLength(120);
    expect(rows[0].stem).toContain('Quoted statement, number 1, with "detail"');
  });

  const source = resolve(process.cwd(), '../frontend/src/assets/hcp_jfa_120_question_database.csv');
  it.skipIf(!existsSync(source))('validates the private 120-row source when it is available locally', async () => {
    const rows = parseQuestionCsv(await readFile(source, 'utf8'));
    expect(rows).toHaveLength(120);
    expect(new Set(rows.map((row) => row.item_id)).size).toBe(120);
    expect(rows.filter((row) => row.response_mode === 'most_least_3')).toHaveLength(72);
    expect(rows.filter((row) => row.response_mode === 'first_second_3')).toHaveLength(24);
    expect(rows.filter((row) => row.response_mode === 'sjt_best_worst_4')).toHaveLength(24);
  });
});

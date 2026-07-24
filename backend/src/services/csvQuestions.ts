import { parse } from 'csv-parse/sync';

export type CsvQuestionRow = Record<string, string>;

export function parseQuestionCsv(contents: string) {
  const rows = parse(contents, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: false,
    trim: false,
  }) as CsvQuestionRow[];
  if (rows.length !== 120) throw new Error(`Expected 120 questions, found ${rows.length}.`);
  if (new Set(rows.map((row) => row.item_id)).size !== rows.length) throw new Error('item_id values must be unique.');
  const expectedModes = { most_least_3: 72, first_second_3: 24, sjt_best_worst_4: 24 } as const;
  for (const [mode, expected] of Object.entries(expectedModes)) {
    const actual = rows.filter((row) => row.response_mode === mode).length;
    if (actual !== expected) throw new Error(`Expected ${expected} ${mode} rows, found ${actual}.`);
  }
  return rows;
}

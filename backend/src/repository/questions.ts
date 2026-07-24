import { pool } from '../db.js';
import type { CandidateQuestion, OptionLetter, QuestionRow } from '../types.js';

const columns = `
  item_id, item_type, response_mode, instruction, stem,
  option_a, option_b, option_c, option_d,
  option_a_trait, option_b_trait, option_c_trait, option_d_trait,
  option_a_key, option_b_key, option_c_key, option_d_key,
  primary_competency_code, primary_competency, profile_priority,
  profile_priority_label, consistency_cluster, variant, reverse_keyed,
  primary_option, best_option_sjt, worst_option_sjt, related_item_ids,
  scoring_rule, source_basis`;

export async function getAllQuestions(): Promise<QuestionRow[]> {
  const result = await pool.query<QuestionRow>(`SELECT ${columns} FROM question_bank ORDER BY item_id`);
  return result.rows;
}

export async function getQuestionsByIds(ids: string[]): Promise<QuestionRow[]> {
  if (!ids.length) return [];
  const result = await pool.query<QuestionRow>(
    `SELECT ${columns} FROM question_bank WHERE item_id = ANY($1::text[])`,
    [ids],
  );
  const byId = new Map(result.rows.map((row) => [row.item_id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is QuestionRow => Boolean(row));
}

export async function getQuestionById(id: string): Promise<QuestionRow | null> {
  const result = await pool.query<QuestionRow>(
    `SELECT ${columns} FROM question_bank WHERE item_id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export function toCandidateQuestion(row: QuestionRow): CandidateQuestion {
  const options = (['A', 'B', 'C', 'D'] as OptionLetter[])
    .map((letter) => ({
      letter,
      text: row[`option_${letter.toLowerCase()}` as keyof QuestionRow] as string | null,
    }))
    .filter((option): option is { letter: OptionLetter; text: string } => Boolean(option.text));

  return {
    itemId: row.item_id,
    itemType: row.item_type,
    responseMode: row.response_mode,
    instruction: row.instruction,
    stem: row.stem,
    options,
  };
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../src/db.js';
import { parseQuestionCsv, type CsvQuestionRow } from '../src/services/csvQuestions.js';

function integer(value: string) {
  return value === '' ? null : Number.parseInt(value, 10);
}

async function importQuestions() {
  const source = resolve(
    process.cwd(),
    process.argv[2] ?? '../frontend/src/assets/hcp_jfa_120_question_database.csv',
  );
  const rows: CsvQuestionRow[] = parseQuestionCsv(await readFile(source, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO question_bank (
          item_id, item_type, response_mode, instruction, stem,
          option_a, option_b, option_c, option_d,
          option_a_trait, option_b_trait, option_c_trait, option_d_trait,
          option_a_key, option_b_key, option_c_key, option_d_key,
          primary_competency_code, primary_competency, profile_priority,
          profile_priority_label, consistency_cluster, variant, reverse_keyed,
          primary_option, best_option_sjt, worst_option_sjt, related_item_ids,
          scoring_rule, source_basis, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now()
        )
        ON CONFLICT (item_id) DO UPDATE SET
          item_type=EXCLUDED.item_type, response_mode=EXCLUDED.response_mode,
          instruction=EXCLUDED.instruction, stem=EXCLUDED.stem,
          option_a=EXCLUDED.option_a, option_b=EXCLUDED.option_b,
          option_c=EXCLUDED.option_c, option_d=EXCLUDED.option_d,
          option_a_trait=EXCLUDED.option_a_trait, option_b_trait=EXCLUDED.option_b_trait,
          option_c_trait=EXCLUDED.option_c_trait, option_d_trait=EXCLUDED.option_d_trait,
          option_a_key=EXCLUDED.option_a_key, option_b_key=EXCLUDED.option_b_key,
          option_c_key=EXCLUDED.option_c_key, option_d_key=EXCLUDED.option_d_key,
          primary_competency_code=EXCLUDED.primary_competency_code,
          primary_competency=EXCLUDED.primary_competency,
          profile_priority=EXCLUDED.profile_priority,
          profile_priority_label=EXCLUDED.profile_priority_label,
          consistency_cluster=EXCLUDED.consistency_cluster, variant=EXCLUDED.variant,
          reverse_keyed=EXCLUDED.reverse_keyed, primary_option=EXCLUDED.primary_option,
          best_option_sjt=EXCLUDED.best_option_sjt, worst_option_sjt=EXCLUDED.worst_option_sjt,
          related_item_ids=EXCLUDED.related_item_ids, scoring_rule=EXCLUDED.scoring_rule,
          source_basis=EXCLUDED.source_basis, updated_at=now()`,
        [
          row.item_id, row.item_type, row.response_mode, row.instruction, row.stem,
          row.option_a, row.option_b, row.option_c, row.option_d || null,
          row.option_a_trait || null, row.option_b_trait || null, row.option_c_trait || null, row.option_d_trait || null,
          integer(row.option_a_key), integer(row.option_b_key), integer(row.option_c_key), integer(row.option_d_key),
          row.primary_competency_code, row.primary_competency, integer(row.profile_priority),
          row.profile_priority_label, row.consistency_cluster, row.variant,
          row.reverse_keyed.toLowerCase() === 'true', row.primary_option || null,
          row.best_option_sjt || null, row.worst_option_sjt || null,
          row.related_item_ids.split('|').filter(Boolean), row.scoring_rule, row.source_basis,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const counts = await pool.query<{ response_mode: string; count: string }>(
    'SELECT response_mode, count(*)::text AS count FROM question_bank GROUP BY response_mode ORDER BY response_mode',
  );
  console.log(`Imported ${rows.length} questions from ${source}`);
  console.table(counts.rows);
}

importQuestions()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

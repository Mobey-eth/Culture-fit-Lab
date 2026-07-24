import { pool } from '../src/db.js';
import { getAllQuestions } from '../src/repository/questions.js';
import { sampleBalancedQuestions } from '../src/services/sampling.js';

async function validateQuestionBank() {
  const summary = await pool.query<{
    total: number; most_least: number; first_second: number; sjt: number;
    clusters: number; min_cluster: number; max_cluster: number; generated: number;
  }>(
    `WITH cluster_counts AS (
       SELECT consistency_cluster, count(*)::int AS total FROM question_bank GROUP BY consistency_cluster
     ) SELECT
       (SELECT count(*)::int FROM question_bank) AS total,
       (SELECT count(*)::int FROM question_bank WHERE response_mode = 'most_least_3') AS most_least,
       (SELECT count(*)::int FROM question_bank WHERE response_mode = 'first_second_3') AS first_second,
       (SELECT count(*)::int FROM question_bank WHERE response_mode = 'sjt_best_worst_4') AS sjt,
       (SELECT count(*)::int FROM cluster_counts) AS clusters,
       (SELECT min(total)::int FROM cluster_counts) AS min_cluster,
       (SELECT max(total)::int FROM cluster_counts) AS max_cluster,
       (SELECT count(*)::int FROM question_bank WHERE item_id ~ '^JFA(12[1-9]|1[3-9][0-9]|200)$') AS generated`,
  );
  const counts = summary.rows[0];
  if (!counts || counts.total !== 200 || counts.most_least !== 120 || counts.first_second !== 40
    || counts.sjt !== 40 || counts.clusters !== 24 || counts.min_cluster < 8
    || counts.max_cluster > 9 || counts.generated !== 80) {
    throw new Error(`Question count validation failed: ${JSON.stringify(counts)}`);
  }

  const invalid = await pool.query<{ item_id: string; reason: string }>(
    `SELECT item_id, reason FROM (
       SELECT item_id, 'work-style option shape' AS reason FROM question_bank
       WHERE response_mode IN ('most_least_3', 'first_second_3')
         AND (option_d IS NOT NULL OR option_a_trait IS NULL OR option_b_trait IS NULL OR option_c_trait IS NULL
           OR option_a_key IS NULL OR option_b_key IS NULL OR option_c_key IS NULL OR primary_option IS NULL)
       UNION ALL
       SELECT item_id, 'scenario option shape' AS reason FROM question_bank
       WHERE response_mode = 'sjt_best_worst_4'
         AND (option_d IS NULL OR best_option_sjt IS NULL OR worst_option_sjt IS NULL
           OR best_option_sjt = worst_option_sjt OR option_a_key IS NULL OR option_b_key IS NULL
           OR option_c_key IS NULL OR option_d_key IS NULL)
       UNION ALL
       SELECT item_id, 'related family mismatch' AS reason FROM question_bank
       WHERE cardinality(related_item_ids) <> (
         SELECT count(*) FROM question_bank family WHERE family.consistency_cluster = question_bank.consistency_cluster
       ) OR EXISTS (
         SELECT 1 FROM unnest(related_item_ids) related_id
         LEFT JOIN question_bank related ON related.item_id = related_id
         WHERE related.item_id IS NULL OR related.consistency_cluster <> question_bank.consistency_cluster
       )
       UNION ALL
       SELECT item_id, 'candidate text leaks assessment metadata' AS reason FROM question_bank
       WHERE item_id ~ '^JFA(12[1-9]|1[3-9][0-9]|200)$'
         AND concat_ws(' ', stem, option_a, option_b, option_c, option_d) ~* '\\m(SHL|HCP|scoring|competency|target profile)\\M'
     ) checks ORDER BY item_id`,
  );
  if (invalid.rows.length) throw new Error(`Invalid question rows: ${JSON.stringify(invalid.rows.slice(0, 20))}`);

  const duplicates = await pool.query<{ signature: string; count: number }>(
    `SELECT md5(concat_ws('|', lower(stem), lower(option_a), lower(option_b), lower(option_c), lower(coalesce(option_d, '')))) AS signature,
            count(*)::int AS count
     FROM question_bank GROUP BY signature HAVING count(*) > 1`,
  );
  if (duplicates.rows.length) throw new Error(`Exact candidate-text duplicates found: ${JSON.stringify(duplicates.rows)}`);

  const distribution = await pool.query(
    `SELECT primary_competency_code AS code, max(primary_competency) AS competency,
            count(*)::int AS total,
            count(*) FILTER (WHERE response_mode = 'most_least_3')::int AS most_least,
            count(*) FILTER (WHERE response_mode = 'first_second_3')::int AS first_second,
            count(*) FILTER (WHERE response_mode = 'sjt_best_worst_4')::int AS scenarios
     FROM question_bank GROUP BY primary_competency_code ORDER BY primary_competency_code`,
  );
  const bank = await getAllQuestions();
  for (let seed = 0; seed < 20; seed += 1) {
    const drill = sampleBalancedQuestions(bank, 20, `validation-drill-${seed}`);
    const simulation = sampleBalancedQuestions(bank, 60, `validation-simulation-${seed}`);
    const drillClusters = new Map<string, number[]>();
    drill.forEach((item, index) => drillClusters.set(item.consistency_cluster, [...(drillClusters.get(item.consistency_cluster) ?? []), index]));
    if (drill.length !== 20 || drillClusters.size !== 10
      || [...drillClusters.values()].some((positions) => positions.length !== 2 || positions[1] - positions[0] < 8)
      || drill.filter((item) => item.response_mode === 'most_least_3').length !== 12
      || drill.filter((item) => item.response_mode === 'first_second_3').length !== 4
      || drill.filter((item) => item.response_mode === 'sjt_best_worst_4').length !== 4) {
      throw new Error(`20-question sampling validation failed for seed ${seed}.`);
    }
    const simulationClusters = new Map<string, number>();
    for (const item of simulation) simulationClusters.set(item.consistency_cluster, (simulationClusters.get(item.consistency_cluster) ?? 0) + 1);
    if (simulation.length !== 60 || simulationClusters.size !== 24
      || [...simulationClusters.values()].some((count) => count < 2)
      || simulation.filter((item) => item.response_mode === 'most_least_3').length !== 36
      || simulation.filter((item) => item.response_mode === 'first_second_3').length !== 12
      || simulation.filter((item) => item.response_mode === 'sjt_best_worst_4').length !== 12) {
      throw new Error(`60-question sampling validation failed for seed ${seed}.`);
    }
  }
  const full = sampleBalancedQuestions(bank, 200, 'validation-full-bank');
  if (full.length !== 200 || new Set(full.map((item) => item.item_id)).size !== 200) {
    throw new Error('Full-bank sampling did not include every item exactly once.');
  }
  console.table(distribution.rows);
  console.log(`Validated ${counts.total} original practice questions and balanced 20/60/200-item sampling across ${counts.clusters} competency clusters.`);
}

validateQuestionBank()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

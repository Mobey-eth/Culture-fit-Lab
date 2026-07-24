import type { QuestionRow, ResponseMode } from '../src/types.js';

export function makeQuestion(itemId: string, cluster: string, responseMode: ResponseMode): QuestionRow {
  return {
    item_id: itemId,
    item_type: responseMode === 'sjt_best_worst_4' ? 'Situational judgment' : 'Work style',
    response_mode: responseMode,
    instruction: 'Choose.', stem: 'Sample', option_a: 'A', option_b: 'B', option_c: 'C',
    option_d: responseMode === 'sjt_best_worst_4' ? 'D' : null,
    option_a_trait: responseMode === 'sjt_best_worst_4' ? null : cluster,
    option_b_trait: responseMode === 'sjt_best_worst_4' ? null : 'C99',
    option_c_trait: responseMode === 'sjt_best_worst_4' ? null : 'C98',
    option_d_trait: null,
    option_a_key: responseMode === 'sjt_best_worst_4' ? 4 : 1,
    option_b_key: responseMode === 'sjt_best_worst_4' ? 3 : 1,
    option_c_key: responseMode === 'sjt_best_worst_4' ? 2 : 1,
    option_d_key: responseMode === 'sjt_best_worst_4' ? 1 : null,
    primary_competency_code: cluster, primary_competency: `Competency ${cluster}`,
    profile_priority: 3, profile_priority_label: 'Important', consistency_cluster: cluster,
    variant: 'Direct', reverse_keyed: false, primary_option: 'A',
    best_option_sjt: responseMode === 'sjt_best_worst_4' ? 'A' : null,
    worst_option_sjt: responseMode === 'sjt_best_worst_4' ? 'D' : null,
    related_item_ids: [], scoring_rule: 'Test', source_basis: 'Test',
  };
}

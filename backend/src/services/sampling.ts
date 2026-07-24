import type { QuestionRow, ResponseMode } from '../types.js';

const responseModes: ResponseMode[] = ['most_least_3', 'first_second_3', 'sjt_best_worst_4'];

export const samplingBiasWeights = {
  explicitlyRelated: 40,
  reversePair: 22,
  differentVariant: 9,
  differentMode: 4,
} as const;

function seededRandom(seed: string) {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function isRelated(left: QuestionRow, right: QuestionRow) {
  return left.related_item_ids.includes(right.item_id)
    || right.related_item_ids.includes(left.item_id)
    || left.consistency_cluster === right.consistency_cluster;
}

function relationshipScore(candidate: QuestionRow, selected: QuestionRow[]) {
  if (!selected.length) return 0;
  return Math.max(...selected.map((existing) => {
    let score = 0;
    if (isRelated(candidate, existing)) score += samplingBiasWeights.explicitlyRelated;
    if (candidate.reverse_keyed !== existing.reverse_keyed) score += samplingBiasWeights.reversePair;
    if (candidate.variant !== existing.variant) score += samplingBiasWeights.differentVariant;
    if (candidate.response_mode !== existing.response_mode) score += samplingBiasWeights.differentMode;
    return score;
  }));
}

function spreadRelatedItems(questions: QuestionRow[], random: () => number) {
  const groups = new Map<string, QuestionRow[]>();
  for (const question of questions) {
    const values = groups.get(question.consistency_cluster) ?? [];
    values.push(question);
    groups.set(question.consistency_cluster, values);
  }
  for (const [cluster, values] of groups) groups.set(cluster, shuffle(values, random));
  const clusterOrder = shuffle([...groups.keys()], random);
  const ordered: QuestionRow[] = [];
  let remaining = questions.length;
  while (remaining > 0) {
    for (const cluster of clusterOrder) {
      const group = groups.get(cluster)!;
      const item = group.shift();
      if (!item) continue;
      ordered.push(item);
      remaining -= 1;
    }
  }
  return ordered;
}

export function modeTargets(count: number, available: Record<ResponseMode, number>) {
  if (count >= Object.values(available).reduce((sum, value) => sum + value, 0)) {
    return { ...available };
  }

  const targets: Record<ResponseMode, number> = {
    most_least_3: Math.round(count * 0.6),
    first_second_3: Math.round(count * 0.2),
    sjt_best_worst_4: 0,
  };
  targets.sjt_best_worst_4 = count - targets.most_least_3 - targets.first_second_3;

  for (const mode of responseModes) targets[mode] = Math.min(targets[mode], available[mode]);
  while (Object.values(targets).reduce((sum, value) => sum + value, 0) < count) {
    const mode = responseModes.find((candidate) => targets[candidate] < available[candidate]);
    if (!mode) break;
    targets[mode] += 1;
  }
  return targets;
}

export function sampleBalancedQuestions(questions: QuestionRow[], count: number, seed: string) {
  const safeCount = Math.max(1, Math.min(count, questions.length));
  const random = seededRandom(seed);
  const allClusters = shuffle([...new Set(questions.map((q) => q.consistency_cluster))], random);
  const pairedClusterCount = safeCount >= allClusters.length * 2
    ? allClusters.length
    : Math.max(1, Math.floor(safeCount / 2));
  const clusters = allClusters.slice(0, Math.min(allClusters.length, pairedClusterCount));
  const available = Object.fromEntries(responseModes.map((mode) => [
    mode,
    questions.filter((question) => question.response_mode === mode).length,
  ])) as Record<ResponseMode, number>;
  const remaining = modeTargets(safeCount, available);
  const pools = new Map<string, QuestionRow[]>();

  for (const cluster of clusters) {
    for (const mode of responseModes) {
      pools.set(
        `${cluster}:${mode}`,
        shuffle(questions.filter((q) => q.consistency_cluster === cluster && q.response_mode === mode), random),
      );
    }
  }

  const chosen: QuestionRow[] = [];
  const chosenIds = new Set<string>();
  const perCluster = new Map(clusters.map((cluster) => [cluster, 0]));

  const take = (cluster: string, mode: ResponseMode) => {
    const pool = pools.get(`${cluster}:${mode}`) ?? [];
    const selectedInCluster = chosen.filter((question) => question.consistency_cluster === cluster);
    const item = pool
      .filter((question) => !chosenIds.has(question.item_id))
      .sort((left, right) => relationshipScore(right, selectedInCluster) - relationshipScore(left, selectedInCluster))[0];
    if (!item || remaining[mode] <= 0) return false;
    chosen.push(item);
    chosenIds.add(item.item_id);
    remaining[mode] -= 1;
    perCluster.set(cluster, (perCluster.get(cluster) ?? 0) + 1);
    return true;
  };

  const minimumPerCluster = safeCount >= clusters.length * 2 ? 2 : safeCount >= clusters.length ? 1 : 0;
  for (let round = 0; round < minimumPerCluster; round += 1) {
    for (const cluster of clusters) {
      const candidates = responseModes
        .filter((mode) => remaining[mode] > 0 && (pools.get(`${cluster}:${mode}`) ?? []).some((q) => !chosenIds.has(q.item_id)))
        .sort((a, b) => remaining[b] / Math.max(1, available[b]) - remaining[a] / Math.max(1, available[a]));
      if (candidates[0]) take(cluster, candidates[0]);
    }
  }

  for (const mode of responseModes) {
    while (remaining[mode] > 0) {
      const candidateClusters = clusters
        .filter((cluster) => (pools.get(`${cluster}:${mode}`) ?? []).some((q) => !chosenIds.has(q.item_id)))
        .sort((a, b) => (perCluster.get(a) ?? 0) - (perCluster.get(b) ?? 0));
      if (!candidateClusters[0] || !take(candidateClusters[0], mode)) break;
    }
  }

  return spreadRelatedItems(chosen, random).slice(0, safeCount);
}

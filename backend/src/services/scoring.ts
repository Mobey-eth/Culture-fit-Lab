import type {
  AssessmentResponse,
  AssessmentResult,
  CompetencyScore,
  OptionLetter,
  QuestionRow,
} from '../types.js';

type ScoringOption = { letter: OptionLetter; text: string; trait: string | null; key: number | null };

function optionsFor(question: QuestionRow): ScoringOption[] {
  return (['A', 'B', 'C', 'D'] as OptionLetter[])
    .map((letter) => {
      const suffix = letter.toLowerCase();
      return {
        letter,
        text: question[`option_${suffix}` as keyof QuestionRow] as string | null,
        trait: question[`option_${suffix}_trait` as keyof QuestionRow] as string | null,
        key: question[`option_${suffix}_key` as keyof QuestionRow] as number | null,
      };
    })
    .filter((option): option is ScoringOption => Boolean(option.text));
}

export function isValidResponse(question: QuestionRow, response?: AssessmentResponse) {
  if (!response || response.itemId !== question.item_id) return false;
  if (question.response_mode === 'first_second_3') {
    return Boolean(response.mostResponse && response.secondResponse && response.mostResponse !== response.secondResponse);
  }
  return Boolean(response.mostResponse && response.leastResponse && response.mostResponse !== response.leastResponse);
}

function bandFor(score: number, opportunities: number): Pick<CompetencyScore, 'band' | 'bandLabel'> {
  if (!opportunities) return { band: 'not_sampled', bandLabel: 'Not sampled' };
  if (score >= 85 && opportunities >= 2) return { band: 'possible_overuse', bandLabel: 'Very strong tendency' };
  if (score >= 68) return { band: 'strong', bandLabel: 'Strong tendency' };
  if (score >= 45) return { band: 'balanced', bandLabel: 'Balanced tendency' };
  return { band: 'developing', bandLabel: 'Less evident' };
}

function consistencySignal(question: QuestionRow, response: AssessmentResponse) {
  const options = optionsFor(question);
  if (question.response_mode === 'sjt_best_worst_4') {
    const selected = options.find((option) => option.letter === response.mostResponse);
    return selected?.key ? (selected.key - 2.5) / 1.5 : 0;
  }

  const primary = options.find((option) => option.letter === question.primary_option);
  if (!primary?.key) return 0;
  if (response.mostResponse === primary.letter) return Math.sign(primary.key);
  if (question.response_mode === 'first_second_3') {
    if (response.secondResponse === primary.letter) return Math.sign(primary.key) * 0.5;
    return Math.sign(primary.key) * -0.5;
  }
  if (response.leastResponse === primary.letter) return Math.sign(primary.key) * -1;
  return 0;
}

function scoreConsistency(questions: QuestionRow[], responses: Map<string, AssessmentResponse>) {
  const grouped = new Map<string, number[]>();
  for (const question of questions) {
    const response = responses.get(question.item_id);
    if (!response || !isValidResponse(question, response)) continue;
    const values = grouped.get(question.consistency_cluster) ?? [];
    values.push(consistencySignal(question, response));
    grouped.set(question.consistency_cluster, values);
  }

  const clusterScores: Array<{ code: string; score: number }> = [];
  for (const [code, values] of grouped) {
    if (values.length < 2) continue;
    let difference = 0;
    let comparisons = 0;
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        difference += Math.abs(values[left] - values[right]);
        comparisons += 1;
      }
    }
    clusterScores.push({ code, score: Math.round(100 - (difference / Math.max(1, comparisons) / 2) * 100) });
  }

  if (!clusterScores.length) {
    return {
      percentage: 0,
      label: 'Insufficient data' as const,
      evaluatedClusters: 0,
      lowClusters: [],
      possibleOvercorrection: false,
      note: 'No consistency score was calculated. It needs at least two answered questions from the same competency cluster; this does not mean your answers were inconsistent.',
    };
  }

  const percentage = Math.round(clusterScores.reduce((sum, item) => sum + item.score, 0) / clusterScores.length);
  const lowClusters = clusterScores.filter((item) => item.score < 55).map((item) => item.code);
  const possibleOvercorrection = clusterScores.filter((item) => item.score < 45).length >= 4;
  return {
    percentage,
    label: percentage >= 80 ? 'High' as const : percentage >= 65 ? 'Moderate' as const : 'Mixed' as const,
    evaluatedClusters: clusterScores.length,
    lowClusters,
    possibleOvercorrection,
    note: possibleOvercorrection
      ? 'Several clusters shifted noticeably. Slow down and answer from your usual behaviour rather than an imagined ideal profile.'
      : 'Variation is normal. This indicator looks for repeated patterns, never a single contradiction.',
  };
}

export function scoreAssessment(
  attemptId: string,
  questions: QuestionRow[],
  catalog: QuestionRow[],
  responseList: AssessmentResponse[],
): AssessmentResult {
  const responses = new Map(responseList.map((response) => [response.itemId, response]));
  const raw = new Map<string, number>();
  const opportunities = new Map<string, number>();
  const competencyNames = new Map(catalog.map((item) => [item.primary_competency_code, item.primary_competency]));
  const priorities = new Map<string, number>();
  const itemIdsByTrait = new Map<string, string[]>();
  const questionNumberById = new Map(questions.map((item, index) => [item.item_id, index + 1]));
  for (const item of catalog) priorities.set(item.primary_competency_code, item.profile_priority);

  let answered = 0;
  let sjtScore = 0;
  let sjtMaximum = 0;
  let sjtWeakestAligned = 0;
  let sjtTotal = 0;
  const scenarioReview: AssessmentResult['scenarioReview'] = [];

  const add = (code: string, value: number) => raw.set(code, (raw.get(code) ?? 0) + value);
  const bump = (code: string) => opportunities.set(code, (opportunities.get(code) ?? 0) + 1);

  for (const question of questions) {
    const response = responses.get(question.item_id);
    if (!response || !isValidResponse(question, response)) continue;
    answered += 1;
    const options = optionsFor(question);

    if (question.response_mode === 'sjt_best_worst_4') {
      sjtTotal += 1;
      const selected = options.find((option) => option.letter === response.mostResponse);
      sjtScore += selected?.key ?? 0;
      sjtMaximum += Math.max(...options.map((option) => option.key ?? 0));
      if (response.leastResponse === question.worst_option_sjt) sjtWeakestAligned += 1;
      const preferred = options.find((option) => option.letter === question.best_option_sjt);
      const weakest = options.find((option) => option.letter === question.worst_option_sjt);
      scenarioReview.push({
        itemId: question.item_id,
        competencyCode: question.primary_competency_code,
        competency: question.primary_competency,
        selectedMost: response.mostResponse,
        selectedLeast: response.leastResponse,
        preferred: preferred ? { letter: preferred.letter, text: preferred.text } : null,
        weakest: weakest ? { letter: weakest.letter, text: weakest.text } : null,
      });
      continue;
    }

    for (const trait of new Set(options.map((option) => option.trait).filter((value): value is string => Boolean(value)))) {
      const itemIds = itemIdsByTrait.get(trait) ?? [];
      if (!itemIds.includes(question.item_id)) itemIds.push(question.item_id);
      itemIdsByTrait.set(trait, itemIds);
    }

    for (const option of options) if (option.trait) bump(option.trait);
    if (question.response_mode === 'most_least_3') {
      const most = options.find((option) => option.letter === response.mostResponse);
      const least = options.find((option) => option.letter === response.leastResponse);
      if (most?.trait && most.key !== null) add(most.trait, 2 * most.key);
      if (least?.trait && least.key !== null) add(least.trait, -1 * least.key);
    } else {
      for (const option of options) {
        if (!option.trait || option.key === null) continue;
        if (option.letter === response.mostResponse) add(option.trait, 2 * option.key);
        else if (option.letter === response.secondResponse) add(option.trait, option.key);
        else add(option.trait, -1 * option.key);
      }
    }
  }

  const competencies = [...competencyNames.entries()]
    .map(([code, name]) => {
      const count = opportunities.get(code) ?? 0;
      const rawScore = raw.get(code) ?? 0;
      const score = count ? Math.round(Math.max(0, Math.min(100, 50 + (rawScore / (count * 2)) * 50))) : 50;
      return { code, name, score, rawScore, opportunities: count, ...bandFor(score, count) };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const sampled = competencies.filter((competency) => competency.opportunities > 0);
  const strongest = sampled.filter((item) => item.band === 'strong').sort((a, b) => b.score - a.score).slice(0, 4);
  const balanced = sampled.filter((item) => item.band === 'balanced').slice(0, 4);
  const possibleOveruse = sampled.filter((item) => item.band === 'possible_overuse').slice(0, 4);
  const priorityWeight = sampled.reduce((sum, item) => sum + (priorities.get(item.code) ?? 1), 0);
  const profileAlignment = priorityWeight
    ? Math.round(sampled.reduce((sum, item) => sum + item.score * (priorities.get(item.code) ?? 1), 0) / priorityWeight)
    : 0;

  const questionPointers = (itemIds: string[]) => itemIds.slice(0, 2).map((itemId) => ({
    itemId,
    number: questionNumberById.get(itemId) ?? 0,
  })).filter((item) => item.number > 0);
  const focusAreas: AssessmentResult['focusAreas'] = [];

  for (const scenario of scenarioReview.filter((item) => (
    item.selectedMost !== item.preferred?.letter || item.selectedLeast !== item.weakest?.letter
  )).slice(0, 2)) {
    const preferredMissed = scenario.selectedMost !== scenario.preferred?.letter;
    const weakestMissed = scenario.selectedLeast !== scenario.weakest?.letter;
    focusAreas.push({
      id: `scenario-${scenario.itemId}`,
      kind: 'scenario',
      competencyCode: scenario.competencyCode,
      title: `Revisit ${scenario.competency}`,
      guidance: preferredMissed && weakestMissed
        ? 'Your preferred and weakest choices differed from the generic scenario scoring. Re-read the situation, identify the central risk, then compare which action is direct, proportionate, and practical.'
        : preferredMissed
          ? 'Your preferred action differed from the generic scoring. Focus on which option addresses the central issue directly without unnecessary delay or escalation.'
          : 'Your weakest-action choice differed from the generic scoring. Look for the option that avoids responsibility, leaves the risk unresolved, or creates a new problem.',
      questions: questionPointers([scenario.itemId]),
    });
  }

  for (const item of possibleOveruse.slice(0, 2)) {
    focusAreas.push({
      id: `balance-${item.code}`,
      kind: 'balance',
      competencyCode: item.code,
      title: `Use ${item.name.toLowerCase()} with flexibility`,
      guidance: 'This strength appeared very frequently across repeated opportunities. That is not a bad result. Review when it genuinely helps and when it might crowd out another useful behaviour, such as speed, delegation, challenge, or adaptability.',
      questions: questionPointers(itemIdsByTrait.get(item.code) ?? []),
    });
  }

  for (const item of sampled.filter((entry) => entry.band === 'developing').sort((a, b) => a.score - b.score).slice(0, 2)) {
    focusAreas.push({
      id: `growth-${item.code}`,
      kind: 'growth',
      competencyCode: item.code,
      title: `Build clearer evidence for ${item.name.toLowerCase()}`,
      guidance: 'This trait appeared less often in this session. Review the linked questions and think of a real work example before ranking the statements. The aim is clearer self-awareness, not selecting an answer simply to raise a score.',
      questions: questionPointers(itemIdsByTrait.get(item.code) ?? []),
    });
  }

  if (!focusAreas.length && sampled.length) {
    const item = [...sampled].sort((a, b) => b.opportunities - a.opportunities)[0];
    focusAreas.push({
      id: `reflection-${item.code}`,
      kind: 'reflection',
      competencyCode: item.code,
      title: 'Keep answers anchored in recent examples',
      guidance: 'No clear scenario miss or repeated balance risk stood out. For your next attempt, pause on the linked questions and use a specific recent example to keep your choices stable and authentic.',
      questions: questionPointers(itemIdsByTrait.get(item.code) ?? []),
    });
  }

  return {
    attemptId,
    completedAt: new Date().toISOString(),
    completion: {
      answered,
      total: questions.length,
      percentage: Math.round((answered / Math.max(1, questions.length)) * 100),
    },
    competencies,
    strongest,
    balanced,
    possibleOveruse,
    consistency: scoreConsistency(questions, responses),
    scenarioJudgment: {
      score: sjtScore,
      maximum: sjtMaximum,
      percentage: sjtMaximum ? Math.round((sjtScore / sjtMaximum) * 100) : 0,
      weakestChoiceAligned: sjtWeakestAligned,
      total: sjtTotal,
    },
    scenarioReview,
    focusAreas: focusAreas.slice(0, 5),
    profileAlignment,
    disclaimer: 'Work-style results describe response tendencies, not objectively correct or incorrect personality answers. Scenario judgment is scored separately.',
  };
}

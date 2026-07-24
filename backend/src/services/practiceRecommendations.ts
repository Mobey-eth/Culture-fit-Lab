import { toCandidateQuestion } from '../repository/questions.js';
import type { AssessmentResult, PracticeCandidate, QuestionRow, ResponseMode } from '../types.js';

const competencyKeywords: Record<string, string[]> = {
  C01: ['integrity', 'ethical', 'ethics', 'honesty', 'confidential', 'confidentiality', 'privacy', 'trust'],
  C02: ['safety', 'dependable', 'dependability', 'reliable', 'reliability', 'risk control'],
  C03: ['ownership', 'responsibility', 'accountability', 'mistake', 'follow through', 'follow-through'],
  C04: ['adapt', 'adaptability', 'change', 'flexible', 'flexibility', 'new process'],
  C05: ['learn', 'learning', 'feedback', 'curiosity', 'develop', 'development', 'new skill'],
  C06: ['uncertainty', 'ambiguity', 'unclear', 'unknown', 'incomplete information'],
  C07: ['analyse', 'analyze', 'analysis', 'evidence', 'data', 'critical thinking', 'bias'],
  C08: ['quality', 'standards', 'accuracy', 'detail', 'thorough', 'defect'],
  C09: ['customer', 'client', 'stakeholder', 'service', 'expectation'],
  C10: ['team', 'teamwork', 'collaboration', 'collaborate', 'shared goal', 'credit'],
  C11: ['relationship', 'relationships', 'courtesy', 'respect', 'professional', 'rapport'],
  C12: ['communicate', 'communication', 'clarity', 'explain', 'understanding', 'message'],
  C13: ['difficult conversation', 'conflict', 'candid', 'constructive feedback', 'challenge', 'speak up'],
  C14: ['time', 'deadline', 'prioritise', 'prioritize', 'punctual', 'efficient', 'timeliness'],
  C15: ['setback', 'resilience', 'composure', 'pressure', 'stress', 'recover'],
  C16: ['innovation', 'innovative', 'improve', 'improvement', 'ideas', 'creative', 'experiment'],
  C17: ['ambition', 'achievement', 'achieve', 'results', 'goal', 'high performance', 'extra mile'],
  C18: ['decision', 'judgment', 'judgement', 'trade-off', 'tradeoff', 'escalate'],
  C19: ['inclusion', 'inclusive', 'listen', 'listening', 'acceptance', 'diverse', 'different view'],
  C20: ['cohesion', 'encourage', 'encouragement', 'morale', 'support team', 'team spirit'],
  C21: ['help', 'coach', 'coaching', 'mentor', 'teach', 'support others'],
  C22: ['document', 'documentation', 'organise', 'organize', 'organization', 'record', 'handover'],
  C23: ['expertise', 'technical', 'practical', 'solution', 'functional', 'apply knowledge'],
  C24: ['commitment', 'organisation', 'organization', 'structure', 'policy', 'procedure', 'authority', 'manager'],
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function explicitCodes(message: string, catalog: QuestionRow[]) {
  const text = ` ${normalized(message)} `;
  const codes = new Set<string>();
  for (const question of catalog) {
    const name = normalized(question.primary_competency);
    if (name.length > 4 && text.includes(` ${name} `)) codes.add(question.primary_competency_code);
  }
  for (const [code, keywords] of Object.entries(competencyKeywords)) {
    if (keywords.some((keyword) => text.includes(` ${normalized(keyword)} `))) codes.add(code);
  }
  return codes;
}

function scoreQuestion(
  question: QuestionRow,
  result: AssessmentResult,
  explicit: Set<string>,
  attempted: Set<string>,
) {
  let score = 0;
  if (explicit.has(question.primary_competency_code)) score += 50;
  if (result.focusAreas.some((area) => area.competencyCode === question.primary_competency_code)) score += 22;
  if (result.consistency.lowClusters.includes(question.consistency_cluster)) score += 18;
  const competency = result.competencies.find((item) => item.code === question.primary_competency_code);
  if (competency?.band === 'developing') score += 15;
  if (competency?.band === 'possible_overuse') score += 8;
  if (!attempted.has(question.item_id)) score += 12;
  if (question.reverse_keyed) score += 5;
  if (/context|scenario|tradeoff|trade-off|reverse/i.test(question.variant)) score += 3;
  return score;
}

/**
 * Build a small, diverse retrieval pool. The model may recommend only items from
 * this candidate-facing subset; scoring keys and target-profile metadata never leave the server.
 */
export function selectPracticeCandidates(
  catalog: QuestionRow[],
  result: AssessmentResult,
  userMessage: string,
  attemptedItemIds: string[],
  limit = 14,
): PracticeCandidate[] {
  const explicit = explicitCodes(userMessage, catalog);
  const attempted = new Set(attemptedItemIds);
  const scored = catalog
    .map((question) => ({ question, score: scoreQuestion(question, result, explicit, attempted) }))
    .sort((left, right) => right.score - left.score
      || left.question.primary_competency_code.localeCompare(right.question.primary_competency_code)
      || left.question.item_id.localeCompare(right.question.item_id));

  const selected: QuestionRow[] = [];
  const perCluster = new Map<string, number>();
  const perMode = new Map<ResponseMode, number>();
  for (const { question } of scored) {
    if (selected.length >= limit) break;
    const clusterCount = perCluster.get(question.consistency_cluster) ?? 0;
    const modeCount = perMode.get(question.response_mode) ?? 0;
    if (clusterCount >= 3 || modeCount >= Math.ceil(limit * 0.65)) continue;
    selected.push(question);
    perCluster.set(question.consistency_cluster, clusterCount + 1);
    perMode.set(question.response_mode, modeCount + 1);
  }

  return selected.map((question) => ({
    ...toCandidateQuestion(question),
    competencyCode: question.primary_competency_code,
    competency: question.primary_competency,
    variant: question.variant,
    reverseKeyed: question.reverse_keyed,
  }));
}

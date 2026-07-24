export type OptionLetter = 'A' | 'B' | 'C' | 'D';
export type ResponseMode = 'most_least_3' | 'first_second_3' | 'sjt_best_worst_4';
export type PracticeMode = 'guided' | 'serious' | 'full' | 'custom' | 'retry';
export type FeedbackTiming = 'immediate' | 'after';

export type SessionSettings = {
  mode: PracticeMode;
  count: number;
  timerSeconds: number | null;
  feedbackTiming: FeedbackTiming;
  assistanceEnabled: boolean;
};

export type AssessmentResponse = {
  attemptId: string;
  itemId: string;
  responseMode: ResponseMode;
  mostResponse: OptionLetter | null;
  leastResponse: OptionLetter | null;
  secondResponse: Exclude<OptionLetter, 'D'> | null;
  flagged: boolean;
  responseTimeMs: number;
  answeredAt: string;
};

export type QuestionRow = {
  item_id: string;
  item_type: string;
  response_mode: ResponseMode;
  instruction: string;
  stem: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string | null;
  option_a_trait: string | null;
  option_b_trait: string | null;
  option_c_trait: string | null;
  option_d_trait: string | null;
  option_a_key: number | null;
  option_b_key: number | null;
  option_c_key: number | null;
  option_d_key: number | null;
  primary_competency_code: string;
  primary_competency: string;
  profile_priority: number;
  profile_priority_label: string;
  consistency_cluster: string;
  variant: string;
  reverse_keyed: boolean;
  primary_option: OptionLetter | null;
  best_option_sjt: OptionLetter | null;
  worst_option_sjt: OptionLetter | null;
  related_item_ids: string[];
  scoring_rule: string;
  source_basis: string;
};

export type CandidateQuestion = {
  itemId: string;
  itemType: string;
  responseMode: ResponseMode;
  instruction: string;
  stem: string;
  options: Array<{ letter: OptionLetter; text: string }>;
};

export type SessionClaims = {
  kind: 'assessment-session';
  attemptId: string;
  questionIds: string[];
  settings: SessionSettings;
};

export type CompetencyScore = {
  code: string;
  name: string;
  score: number;
  rawScore: number;
  opportunities: number;
  band: 'not_sampled' | 'developing' | 'balanced' | 'strong' | 'possible_overuse';
  bandLabel: string;
};

export type FocusArea = {
  id: string;
  kind: 'scenario' | 'balance' | 'growth' | 'reflection';
  competencyCode: string | null;
  title: string;
  guidance: string;
  questions: Array<{ itemId: string; number: number }>;
};

export type AssessmentResult = {
  attemptId: string;
  completedAt: string;
  completion: { answered: number; total: number; percentage: number };
  competencies: CompetencyScore[];
  strongest: CompetencyScore[];
  balanced: CompetencyScore[];
  possibleOveruse: CompetencyScore[];
  consistency: {
    percentage: number;
    label: 'High' | 'Moderate' | 'Mixed' | 'Insufficient data';
    evaluatedClusters: number;
    lowClusters: string[];
    possibleOvercorrection: boolean;
    note: string;
  };
  scenarioJudgment: {
    score: number;
    maximum: number;
    percentage: number;
    weakestChoiceAligned: number;
    total: number;
  };
  scenarioReview: Array<{
    itemId: string;
    competencyCode: string;
    competency: string;
    selectedMost: OptionLetter | null;
    selectedLeast: OptionLetter | null;
    preferred: { letter: OptionLetter; text: string } | null;
    weakest: { letter: OptionLetter; text: string } | null;
  }>;
  focusAreas: FocusArea[];
  profileAlignment: number;
  disclaimer: string;
};

export type CoachingMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  nextSteps: string[];
  recommendations: Array<{ itemId: string; reason: string }>;
};

export type PracticeCandidate = CandidateQuestion & {
  competencyCode: string;
  competency: string;
  variant: string;
  reverseKeyed: boolean;
};

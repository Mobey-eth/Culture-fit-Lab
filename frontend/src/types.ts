export type OptionLetter = 'A' | 'B' | 'C' | 'D';
export type ResponseMode = 'most_least_3' | 'first_second_3' | 'sjt_best_worst_4';
export type PracticeMode = 'guided' | 'serious' | 'full' | 'custom' | 'retry';
export type FeedbackTiming = 'immediate' | 'after';

export type CandidateQuestion = {
  itemId: string;
  itemType: string;
  responseMode: ResponseMode;
  instruction: string;
  stem: string;
  options: Array<{ letter: OptionLetter; text: string }>;
};

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

export type Hint = {
  title: string;
  guidance: string;
  strongAnswer: string;
  weakAnswer: string;
  reflectionQuestion: string;
};
export type Coaching = {
  summary: string;
  strengths: string[];
  coachingTips: string[];
  consistencyCoaching: string;
  practicePlan: string[];
};

export type CoachingMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  nextSteps: string[];
  recommendations: Array<{ itemId: string; reason: string }>;
};

export type RecommendedQuestion = CandidateQuestion & {
  competency: string;
  reason: string;
};

export type AttemptSnapshot = {
  savedAt: string;
  attemptId: string;
  sessionToken: string;
  settings: SessionSettings;
  questions: CandidateQuestion[];
  responses: Record<string, AssessmentResponse>;
  flagged: Record<string, boolean>;
  currentIndex: number;
  timeRemaining: number;
  screen: 'assessment' | 'review';
  source?: 'local' | 'cloud';
};

export type User = {
  userId?: string;
  id?: string;
  username?: string;
  email?: string | null;
  role: string;
};

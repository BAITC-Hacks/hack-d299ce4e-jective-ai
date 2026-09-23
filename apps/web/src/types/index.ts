export interface TaskDraft {
  id: string;
  rawDescription: string;
  industry?: string;
  questions: ClarifyingQuestion[];
  answers: Record<string, string>;
  createdAt: string;
}

export interface ClarifyingQuestion {
  id: string;
  field: string;
  question: string;
  whyNeeded: string;
}

export interface Task {
  id: string;
  title: string | null;
  context: string | null;
  need: string | null;
  users: string | null;
  data: string | null;
  constraints: string | null;
  expectedResult: string | null;
  successCriteria: string | null;
  businessContact: string | null;
  interactionFormat: string | null;
  industry?: string;
  missingInformation: string[];
  status: 'draft' | 'published';
  rating: Rating;
  proposalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RatingCategory {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  reason: string;
  missing: string[];
  suggestion?: string;
  potentialGain?: number;
}

export interface Rating {
  total: number;
  level: 'draft' | 'working' | 'ready' | 'priority';
  categories: RatingCategory[];
  missingInformation: string[];
  potentialScore: number;
}

export interface Team {
  id: string;
  name: string;
  skills: string[];
  interests: string[];
}

export interface Proposal {
  id: string;
  taskId: string;
  teamId: string;
  teamName: string;
  solutionIdea: string;
  plan: string;
  estimatedTime: string;
  prototypeUrl?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

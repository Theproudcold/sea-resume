import type { AiResumeContext } from '@/services/ai/resumeContext';
import type { AiUsage } from '@/services/ai/AiClient';

export type InterviewMode = 'training' | 'real';
export type InterviewDirection = '综合' | '项目深挖' | '岗位专业' | '行为面试';
export type InterviewStage = 'initialize' | 'coach' | 'next' | 'report';
export type InterviewStatus = 'ready' | 'running' | 'answering' | 'reviewing' | 'paused' | 'interrupted' | 'failed' | 'completed';
export interface InterviewSettings {
  targetRole: string;
  jd: string;
  level: string;
  direction: InterviewDirection;
  mode: InterviewMode;
  mainQuestionLimit: 5 | 8 | 12;
}
export interface InterviewQuestion {
  text: string;
  focus: string;
  kind: 'experience' | 'knowledge' | 'behavior';
  itemIds: string[];
}
export interface InterviewEvidence { sourceId: string; snippet: string }
export interface InterviewObservation {
  category: 'strength' | 'expression' | 'knowledge';
  text: string;
  verification: 'context-supported' | 'needs-verification';
  evidence: InterviewEvidence[];
}
export interface InterviewFeedback {
  observations: InterviewObservation[];
  organizationHint: string;
  knowledgeExplanation: string;
  /** Constructed from cited submitted facts, not an invented model answer. */
  referencePhrasing: string;
}
export interface InterviewTurn {
  id: string;
  mainNumber: number;
  followup: boolean;
  question: InterviewQuestion;
  answer?: string;
  skipped?: boolean;
  submittedAt?: string;
  feedback?: InterviewFeedback;
}
export interface InterviewBackfillFact {
  id: string;
  answerId: string;
  text: string;
}
export interface InterviewReport {
  incomplete: boolean;
  observations: InterviewObservation[];
  followupReview: InterviewObservation[];
  priorities: string[];
  facts: InterviewBackfillFact[];
  referencePhrasing: string;
  knowledgeExplanation: string;
}
export interface InterviewSession {
  id: string;
  sourceResumeId: string;
  createdAt: string;
  updatedAt: string;
  context: AiResumeContext;
  settings: InterviewSettings;
  provider: { baseUrl: string; model: string };
  status: InterviewStatus;
  pendingStage: InterviewStage | null;
  coveragePlan: string[];
  turns: InterviewTurn[];
  report?: InterviewReport;
  usage: AiUsage;
  persistence: boolean;
  jsonMode: boolean;
  ending: boolean;
}

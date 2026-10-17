export type ResumeAiOperation =
  | { type: 'set_basic'; field: 'name' | 'title' | 'email' | 'phone' | 'location' | 'website' | 'summary'; value: string }
  | { type: 'update_experience'; id: string; field: 'company' | 'position' | 'startDate' | 'endDate' | 'description' | 'highlights'; value: string | string[] }
  | { type: 'update_project'; id: string; field: 'name' | 'role' | 'startDate' | 'endDate' | 'description' | 'link' | 'techStack'; value: string | string[] }
  | { type: 'update_education'; id: string; field: 'school' | 'degree' | 'major' | 'startDate' | 'endDate' | 'gpa'; value: string }
  | { type: 'update_skill'; id: string; field: 'category' | 'items'; value: string | string[] }
  | { type: 'update_custom_block'; id: string; field: 'title' | 'content'; value: string }
  | { type: 'set_template'; templateId: 'modern' | 'professional' | 'creative' | 'minimal' | 'tech' | 'ai-agent' }
  | { type: 'reorder_sections'; sectionOrder: string[] };

export interface ResumeAiDraft {
  explanation: string;
  operations: ResumeAiOperation[];
}

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  authMode?: 'bearer' | 'none';
  jsonMode?: boolean;
  timeoutMs?: number;
}

// Fixed, bounded optimization protocol. Legacy quick-assistant types above are unchanged.
export interface OptimizationFact { id: string; text: string; targetId: string }
export interface OptimizationOptions {
  target: string;
  company: string;
  jd: string;
  style: 'concise' | 'professional';
  personalSample: string;
  generalizeOrganizations: boolean;
}
export type OptimizationStep = 'analysis' | 'rewrite' | 'review';
export type OptimizationStage = 'configuration' | OptimizationStep | 'supplement' | 'ready' | 'completed' | 'failed' | 'cancelled';
export type OptimizationOperation =
  | { type: 'set_basic'; field: 'title' | 'summary'; value: string }
  | { type: 'update_experience'; id: string; field: 'position' | 'description'; value: string }
  | { type: 'update_experience'; id: string; field: 'highlights'; value: string[] }
  | { type: 'update_project'; id: string; field: 'role' | 'description'; value: string }
  | { type: 'update_project'; id: string; field: 'techStack'; value: string[] }
  | { type: 'update_education'; id: string; field: 'degree' | 'major'; value: string }
  | { type: 'update_skill'; id: string; field: 'category'; value: string }
  | { type: 'update_skill'; id: string; field: 'items'; value: string[] }
  | { type: 'update_custom_block'; id: string; field: 'title' | 'content'; value: string };
export interface OptimizationQuestion { id: string; text: string; targetId: string }
export interface OptimizationAnalysis {
  summary: string;
  matches: Array<{ requirement: string; assessment: string; sourceRefs: string[] }>;
  issues: string[];
  questions: OptimizationQuestion[];
}
export interface ResumeSuggestion {
  id: string;
  operation: OptimizationOperation;
  before: string | string[];
  reason: string;
  requirement: string;
  sourceRefs: string[];
  review: 'unreviewed' | 'pass' | 'confirm' | 'reject';
  reviewReason: string;
  selected: boolean;
  confirmed: boolean;
  rejected: boolean;
}
export interface ResumeOptimizationRun {
  id: string;
  sourceResumeId: string;
  createdAt: string;
  updatedAt: string;
  options: OptimizationOptions;
  provider: Omit<AiProviderConfig, 'apiKey'>;
  context: import('@/services/ai/resumeContext').AiResumeContext;
  baseline: Record<string, string | string[]>;
  stage: OptimizationStage;
  failedStep?: OptimizationStep;
  analysis?: OptimizationAnalysis;
  facts: OptimizationFact[];
  supplementAnswers?: Record<string, { text: string; confirmed: boolean }>;
  suggestions: ResumeSuggestion[];
  usage: { calls: number; promptTokens: number; completionTokens: number };
  appliedResumeId?: string;
}

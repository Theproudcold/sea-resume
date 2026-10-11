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
}

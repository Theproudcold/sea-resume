import type { ResumeData } from '@/types/resume';

export interface AiResumeContext {
  resumeId: string;
  basic: { title: string; summary: string };
  experiences: Array<{ id: string; company: string; position: string; startDate: string; endDate: string; description: string; highlights: string[] }>;
  projects: Array<{ id: string; name: string; role: string; startDate: string; endDate: string; description: string; techStack: string[] }>;
  education: Array<{ id: string; school: string; degree: string; major: string; startDate: string; endDate: string; gpa: string }>;
  skills: Array<{ id: string; category: string; items: string[] }>;
  customBlocks: Array<{ id: string; title: string; content: string }>;
}
export interface AiContextOptions { generalizeOrganizations?: boolean }
/** Plain text is rendered as text, never trusted HTML. Explicit structured contacts are never sent. */
export function aiPlainText(value: string = ''): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 10000);
}
export function buildResumeContext(resume: ResumeData, options: AiContextOptions = {}): AiResumeContext {
  const shown = (section: string) => resume.sectionOrder.includes(section) && !resume.hiddenSections?.includes(section);
  const text = aiPlainText;
  return {
    resumeId: resume.id,
    basic: { title: text(resume.basic.title), summary: text(resume.basic.summary) },
    experiences: shown('experience') ? resume.experiences.filter(e => e.visible !== false).map((e, i) => ({ id: e.id, company: options.generalizeOrganizations ? `公司 ${i + 1}` : text(e.company), position: text(e.position), startDate: e.startDate, endDate: e.endDate, description: text(e.description), highlights: (e.highlights ?? []).map(text) })) : [],
    projects: shown('projects') ? resume.projects.filter(e => e.visible !== false).map(e => ({ id: e.id, name: text(e.name), role: text(e.role), startDate: e.startDate, endDate: e.endDate, description: text(e.description), techStack: (e.techStack ?? []).map(text) })) : [],
    education: shown('education') ? resume.education.filter(e => e.visible !== false).map((e, i) => ({ id: e.id, school: options.generalizeOrganizations ? `学校 ${i + 1}` : text(e.school), degree: text(e.degree), major: text(e.major), startDate: e.startDate, endDate: e.endDate, gpa: text(e.gpa) })) : [],
    skills: shown('skills') ? resume.skills.filter(e => e.visible !== false).map(e => ({ id: e.id, category: text(e.category), items: e.items.map(text) })) : [],
    customBlocks: resume.customBlocks.filter(e => shown(e.id)).map(e => ({ id: e.id, title: text(e.title), content: typeof e.content === 'string' ? text(e.content) : e.content.filter(item => item.visible !== false).map(item => [item.title, item.subtitle, item.date, item.description].filter(Boolean).map(v => text(v!)).join(' · ')).join('\n') })),
  };
}
/** Source IDs identify exact sent fields. Model citations must be a member of this map. */
export function contextSources(context: AiResumeContext): Record<string, string> {
  const sources: Record<string, string> = {};
  Object.entries(context.basic).forEach(([field, value]) => { sources[`basic.${field}`] = value; });
  for (const collection of ['experiences', 'projects', 'education', 'skills', 'customBlocks'] as const) {
    for (const item of context[collection]) {
      for (const [field, value] of Object.entries(item)) {
        if (field !== 'id') sources[`${collection}.${item.id}.${field}`] = Array.isArray(value) ? value.join('、') : String(value);
      }
    }
  }
  return sources;
}
export function contextItemIds(context: AiResumeContext): string[] { return [...context.experiences, ...context.projects, ...context.education, ...context.skills, ...context.customBlocks].map(item => item.id); }

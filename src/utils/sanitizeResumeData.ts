import type { ResumeData } from '@/types/resume';
import { sanitizeMarkdownUrl, sanitizeRichTextHtml } from '@/utils/markdown/markdownSafety';

const SAFE_AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,/i;

/** Clone untrusted resume data while preserving structure and sanitizing fields used in HTML or URL sinks. */
export function sanitizeResumeDataContent(source: ResumeData): ResumeData {
  const resume = JSON.parse(JSON.stringify(source)) as ResumeData;
  resume.basic.website = sanitizeMarkdownUrl(resume.basic.website ?? '') ?? undefined;
  resume.basic.avatar = resume.basic.avatar && SAFE_AVATAR_DATA_URL.test(resume.basic.avatar)
    ? resume.basic.avatar
    : undefined;
  if (resume.basic.summary !== undefined) resume.basic.summary = sanitizeRichTextHtml(resume.basic.summary);
  resume.experiences = resume.experiences.map((item) => ({
    ...item,
    description: sanitizeRichTextHtml(item.description),
  }));
  resume.projects = resume.projects.map((item) => ({
    ...item,
    description: sanitizeRichTextHtml(item.description),
    link: sanitizeMarkdownUrl(item.link ?? '') ?? undefined,
  }));
  resume.customBlocks = resume.customBlocks.map((block) => ({
    ...block,
    content: Array.isArray(block.content)
      ? block.content.map((item) => ({ ...item, description: sanitizeRichTextHtml(item.description) }))
      : sanitizeRichTextHtml(block.content),
  }));
  return resume;
}

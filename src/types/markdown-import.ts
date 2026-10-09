import type { ResumeData } from './resume';

export interface MarkdownImportWarning {
  code: 'unknown-frontmatter' | 'unknown-section' | 'unmapped-link' | 'uncertain-date' | 'unsafe-html' | 'parse';
  message: string;
  detail?: string;
}

export interface MarkdownImportResult {
  resume: ResumeData;
  warnings: MarkdownImportWarning[];
  recognizedSections: string[];
  unknownSections: string[];
  sourceTitle: string;
}

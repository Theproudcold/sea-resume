import type { PdfTemplateLayout, PdfLayoutVariant } from './types';
import { aiAgentPdfLayout } from './ai-agent';
import { creativePdfLayout } from './creative';
import { minimalPdfLayout } from './minimal';
import { modernPdfLayout } from './modern';
import { professionalPdfLayout } from './professional';
import { techPdfLayout } from './tech';

export type { PdfTemplateLayout, PdfLayoutVariant } from './types';

export const pdfTemplateLayouts: Record<PdfLayoutVariant, PdfTemplateLayout> = {
  modern: modernPdfLayout,
  professional: professionalPdfLayout,
  creative: creativePdfLayout,
  minimal: minimalPdfLayout,
  tech: techPdfLayout,
  'ai-agent': aiAgentPdfLayout,
};

export function getPdfTemplateLayout(templateId: string): PdfTemplateLayout {
  return pdfTemplateLayouts[templateId as PdfLayoutVariant] ?? modernPdfLayout;
}

import type { PdfTemplateLayout, PdfLayoutVariant } from './types';
import { aiAgentPdfLayout } from './ai-agent';
import { campusPdfLayout } from './campus';
import { classicPdfLayout } from './classic';
import { creativePdfLayout } from './creative';
import { editorialPdfLayout } from './editorial';
import { engineerPdfLayout } from './engineer';
import { executivePdfLayout } from './executive';
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
  classic: classicPdfLayout,
  editorial: editorialPdfLayout,
  engineer: engineerPdfLayout,
  executive: executivePdfLayout,
  campus: campusPdfLayout,
};

export function getPdfTemplateLayout(templateId: string): PdfTemplateLayout {
  return pdfTemplateLayouts[templateId as PdfLayoutVariant] ?? modernPdfLayout;
}

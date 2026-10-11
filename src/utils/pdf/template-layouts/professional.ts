import type { PdfTemplateLayout } from './types';

export const professionalPdfLayout: PdfTemplateLayout = {
  id: 'professional',
  variant: 'professional',
  accent: '#243447',
  ink: '#202a35',
  muted: '#64707c',
  sidebarSections: ['education', 'skills'],
  pageMargin: 34,
  compact: true,
};

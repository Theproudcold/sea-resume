import type { PdfTemplateLayout } from './types';

export const editorialPdfLayout: PdfTemplateLayout = {
  id: 'editorial',
  variant: 'editorial',
  accent: '#0f766e',
  ink: '#1c1917',
  muted: '#57534e',
  sidebarSections: ['skills', 'education'],
  sidebarSide: 'right',
  pageMargin: 32,
};

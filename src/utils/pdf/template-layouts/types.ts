export type PdfLayoutVariant =
  | 'modern'
  | 'professional'
  | 'creative'
  | 'minimal'
  | 'tech'
  | 'ai-agent'
  | 'classic'
  | 'editorial'
  | 'engineer'
  | 'executive'
  | 'campus';

export interface PdfTemplateLayout {
  id: PdfLayoutVariant;
  variant: PdfLayoutVariant;
  accent: string;
  ink: string;
  muted: string;
  headerFill?: string;
  headerText?: string;
  sidebarSections?: string[];
  sidebarSide?: 'left' | 'right';
  pageMargin: number;
  compact?: boolean;
}

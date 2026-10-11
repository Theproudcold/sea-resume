export type PdfLayoutVariant = 'modern' | 'professional' | 'creative' | 'minimal' | 'tech' | 'ai-agent';

export interface PdfTemplateLayout {
  id: PdfLayoutVariant;
  variant: PdfLayoutVariant;
  accent: string;
  ink: string;
  muted: string;
  headerFill?: string;
  headerText?: string;
  sidebarSections?: string[];
  pageMargin: number;
  compact?: boolean;
}

import type { LayoutRecipe } from '@/types/layout-template';
import type { ResumeData } from '@/types/resume';
import { builtinToRecipe, isLayoutSeedId, layoutWithVisibleTheme, readLayoutRecipe } from '@/utils/layout-template';

/** 给模型一份完整底稿。已有版式时带上当前主题，避免模型照抄旧字号后把滑块改动写回去。 */
export function layoutEditBasis(resume: ResumeData): { layout: LayoutRecipe | null; layoutSeed: LayoutRecipe } {
  const stored = readLayoutRecipe(resume.layout);
  const seedId = isLayoutSeedId(resume.templateId) ? resume.templateId : stored?.seedId ?? 'modern';
  return {
    layout: stored ? layoutWithVisibleTheme(stored, resume.theme) : null,
    layoutSeed: builtinToRecipe(seedId, resume.theme),
  };
}

/** 快捷助手与外部 AI 共用的改版式步骤。两边只改语言，不改决策。 */
export const QUICK_LAYOUT_GUIDANCE = [
  '版式只在用户提到排版时才改。没提到栏数、侧栏、页眉、头像、标题样式、纸色、字号、行距、页边距或主题色时，不要输出 set_layout，也不要为了“顺便整理”输出 set_template。',
  '用户只是点名一套现成模板，且没有额外的结构要求时，只输出一条 set_template：现代简约 modern、商务专业 professional、创意设计 creative、极简 minimal、科技 tech、AI Agent ai-agent。这条操作会去掉自定义版式，不要再附 set_layout。',
  '用户要改结构、页眉、纸色，或只改字号、行距、边距、主题色时，只输出一条 set_layout，不要同时 set_template。',
  'set_layout 必须返回完整版式，不能只写改过的字段。底稿用本次数据里的 layout；layout 为 null 时改用 layoutSeed。用户没提到的字段原样保留，否则字号和颜色会被重置。',
  'layout 为 null 表示取消自定义版式并回到当前内置模板，不改正文，也不改现有主题。',
  '套用后，tokens 的 fontSize、lineHeight、pageMargins、moduleMargins、accent、dateFormat、displayIcons 会变成简历上看得见的主题。structure、paper、ink、muted 和 header 只由版式决定。',
  '深色纸必须配浅色字：tokens.ink 用 #d7dee6，tokens.muted 用 #9aa6b2。浅色纸用 #1f2937 和 #64748b。不要让深色纸留下深色字。',
  'sidebarSections 只能取 sectionOrder 里已有的 id，不能重复。单栏用空数组。简介或联系方式放进侧栏时，structure 不能是 single。',
  '不要输出 CSS、HTML、class 或协议外字段。schemaVersion 只能是 1，颜色只能是 #RRGGBB。',
  '取值：structure 为 single、sidebar-left、sidebar-right；sidebarWidth 为 24 到 42；customBlockRegion 为 main 或 sidebar；summaryPlacement 为 main、sidebar、hidden；contactsPlacement 为 header 或 sidebar；header.variant 为 inline、banner、stacked；header.align 为 start、center；header.avatar 为 start、end、none；header.fill 为 none、accent；heading 为 underline、accent、plain；paper 为 light、dark。fontSize 为 12 到 18，lineHeight 为 1 到 2，pageMargins 为 0 到 60，moduleMargins 四边为 0 到 64。dateFormat 只能是 YYYY.MM、YYYY-MM、YYYY/MM、MM/YYYY、MMM YYYY。fontFamily 只能是下面的推荐字体原文，或 sans-serif、serif、monospace。',
].join('\n');

export const EXTERNAL_LAYOUT_GUIDANCE = [
  'Use set_layout only when the user asks for columns, sidebar, header, avatar placement, heading style, paper, type size, spacing, margins, or accent. Otherwise omit it. Never use set_template or reorder_sections.',
  'Return exactly one set_layout and the complete recipe, not a partial patch. Copy the top-level layout field in the exported context; when it is null, copy layoutSeed. The resume text object has no layout. Keep every field the user did not name.',
  'layout null clears the custom layout and returns to the built-in template already selected. It does not change resume text or the current theme.',
  'tokens.fontSize, lineHeight, pageMargins, moduleMargins, accent, dateFormat, and displayIcons become the visible theme. structure, paper, ink, muted, and header stay in the layout.',
  'Dark paper requires ink #d7dee6 and muted #9aa6b2. Light paper requires ink #1f2937 and muted #64748b.',
  'sidebarSections must be existing ids from sectionOrder, without duplicates. A single column uses an empty array. Putting the summary or contacts in the sidebar requires sidebar-left or sidebar-right.',
  'schemaVersion must be 1. Colors are #RRGGBB only. Do not send CSS, HTML, class names, or extra fields.',
  'Allowed values: structure single|sidebar-left|sidebar-right; sidebarWidth 24-42; customBlockRegion main|sidebar; summaryPlacement main|sidebar|hidden; contactsPlacement header|sidebar; header.variant inline|banner|stacked; header.align start|center; header.avatar start|end|none; header.fill none|accent; heading underline|accent|plain; paper light|dark; fontSize 12-18; lineHeight 1-2; pageMargins 0-60; each module margin 0-64; dateFormat YYYY.MM|YYYY-MM|YYYY/MM|MM/YYYY|MMM YYYY; fontFamily is the recommended family, sans-serif, serif, or monospace.',
].join(' ');

import { describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import { formatResumeDateRange } from '../dateFormat';
import { createResumePdfDefinition } from '../createResumePdfDefinition';
import { richTextToPdfContent } from '../richText';
import { buildResumeSections } from '../sections';
import { getPdfTemplateLayout, pdfTemplateLayouts } from '../template-layouts';
import type { ResumeData } from '@/types/resume';

function textFrom(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textFrom).join(' ');
  if (value && typeof value === 'object') return Object.entries(value)
    .filter(([key]) => key !== 'link')
    .map(([, child]) => textFrom(child))
    .join(' ');
  return '';
}

function cloneDemo(): ResumeData {
  return structuredClone(templateDemoData);
}

describe('pdfmake resume definition', () => {
  it('provides a dedicated layout for each supported template and falls back safely', () => {
    expect(Object.keys(pdfTemplateLayouts)).toEqual(['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent']);
    expect(getPdfTemplateLayout('unknown')).toBe(pdfTemplateLayouts.modern);
    for (const templateId of Object.keys(pdfTemplateLayouts)) {
      const definition = createResumePdfDefinition({ ...cloneDemo(), templateId });
      expect(definition.pageSize).toBe('A4');
      expect(textFrom(definition.content)).toContain('李晨阳');
    }
    expect(pdfTemplateLayouts.professional.sidebarSections).toEqual(['education', 'skills']);
    expect(pdfTemplateLayouts.creative.headerFill).toBeTruthy();
    expect(pdfTemplateLayouts.tech.headerFill).toBeTruthy();
  });

  it('honors section order, hidden sections, hidden entries and custom block visibility without mutating data', () => {
    const data = cloneDemo();
    data.sectionOrder = ['projects', 'experience', 'education', 'skills', 'awards'];
    data.hiddenSections = ['education'];
    data.experiences[0]!.visible = false;
    data.projects[0]!.visible = false;
    data.customBlocks = [{
      id: 'awards', title: '获奖经历', type: 'list', order: 0,
      content: [
        { id: 'award-hidden', title: '不应出现', date: '', description: 'hidden', visible: false },
        { id: 'award-visible', title: '优秀奖', date: '2024', description: '<p>团队荣誉</p>' },
      ],
    }];
    const orderBefore = [...data.customBlocks];

    const sections = buildResumeSections(data);
    expect(sections.map((section) => section.id)).toEqual(['projects', 'experience', 'skills', 'awards']);
    expect(textFrom(sections)).not.toContain('星海科技有限公司');
    expect(textFrom(sections)).not.toContain('智能数据看板平台');
    expect(textFrom(sections)).not.toContain('华东理工大学');
    expect(textFrom(sections)).not.toContain('不应出现');
    expect(textFrom(sections)).toContain('优秀奖');
    expect(data.customBlocks).toEqual(orderBefore);
  });

  it('formats all supported date masks and preserves unknown dates', () => {
    expect(formatResumeDateRange('2024-03', 'present', 'YYYY-MM')).toBe('2024-03 - 至今');
    expect(formatResumeDateRange('2024/03', '2025.11', 'MM/YYYY')).toBe('03/2024 - 11/2025');
    expect(formatResumeDateRange('now', '', 'MMM YYYY')).toBe('now');
  });

  it('converts allowed rich text to searchable runs and rejects unsafe markup and links', () => {
    const content = richTextToPdfContent(
      '<p>普通<strong>加粗</strong><em>斜体</em><a href="https://example.com/profile">安全链接</a><a href="javascript:alert(1)">危险链接</a></p><ul><li>列表一</li><li><u>列表二</u></li></ul><script>不应导出</script><img src="https://example.com/tracker.png">',
    );
    const serialized = JSON.stringify(content);
    expect(serialized).toContain('加粗');
    expect(serialized).toContain('斜体');
    expect(serialized).toContain('https://example.com/profile');
    expect(serialized).toContain('列表一');
    expect(serialized).not.toContain('javascript:');
    expect(serialized).not.toContain('不应导出');
    expect(serialized).not.toContain('tracker.png');
  });

  it('uses normalized page settings and preserves rich summary text', () => {
    const data = cloneDemo();
    data.basic.summary = '<p>简介中的<strong>中文</strong>和 <a href="mailto:a@example.com">邮箱</a></p>';
    const definition = createResumePdfDefinition(data);
    const content = textFrom(definition.content);
    expect(content).toContain('简介中的');
    expect(content).toContain('中文');
    expect(content).toContain('邮箱');
    expect(definition.pageMargins).toEqual([18, 18, 18, 18]);
  });
  it('exports the already-masked privacy copy without touching stored resume data', async () => {
    const data = cloneDemo();
    const originalName = data.basic.name;
    const originalEmail = data.basic.email;
    const originalPhone = data.basic.phone;
    const { createPrivacyMaskedResume } = await import('@/utils/privacyMask');
    const maskedDefinition = createResumePdfDefinition(createPrivacyMaskedResume(data));
    const text = textFrom(maskedDefinition.content);

    expect(text).toContain('匿名用户');
    expect(text).not.toContain(originalName);
    expect(text).not.toContain(originalEmail);
    expect(text).not.toContain(originalPhone);
    expect(data.basic.name).toBe(originalName);
    expect(data.basic.email).toBe(originalEmail);
  });
});

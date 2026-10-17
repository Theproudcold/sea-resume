import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { buildResumeContext, contextSources } from '../resumeContext';
import { aiReferences } from '../aiOutputValidation';

function fixture() {
  const r = parseResumeMarkdown('# 示例').resume;
  r.id = 'r1';
  Object.assign(r.basic, { name: '私人姓名', phone: '13800000000', email: 'secret@example.com', birthDate: '1990-01-01', avatar: 'private-image', summary: '<p>工程师</p>', customContacts: [{ id: 'c1', label: '微信', value: 'private-id', icon: '' }] });
  r.experiences = [{ id: 'e1', company: '真实公司', position: '开发', startDate: '2020-01', endDate: 'present', description: '负责接口' }, { id: 'hidden', company: '隐藏公司', position: '', startDate: '', endDate: '', description: '隐藏事实', visible: false }];
  r.projects = [{ id: 'p1', name: '隐藏项目', role: '', startDate: '', endDate: '', description: '' }];
  r.education = [{ id: 'ed1', school: '真实学校', degree: '学士', major: '计算机', startDate: '', endDate: '' }];
  r.hiddenSections = ['projects'];
  r.customBlocks = [{ id: 'b1', title: '成果', type: 'list', order: 0, content: [{ id: 'i1', title: '可见奖项', description: '' }, { id: 'i2', title: '隐藏奖项', visible: false, description: '' }] }];
  r.sectionOrder.push('b1');
  return r;
}
describe('AI resume context', () => {
  it('sends only visible whitelisted content, never structured identity or presentation', () => {
    const r = fixture(); const context = buildResumeContext(r); const encoded = JSON.stringify(context);
    for (const secret of ['私人姓名', '13800000000', 'secret@example.com', '1990-01-01', 'private-image', 'private-id', '隐藏公司', '隐藏事实', '隐藏项目', '隐藏奖项', 'theme', 'templateId']) expect(encoded).not.toContain(secret);
    expect(context.experiences).toHaveLength(1);
    expect(context.customBlocks[0]?.content).toContain('可见奖项');
    expect(r.basic.phone).toBe('13800000000');
  });
  it('generalizes companies/schools while retaining stable field citation IDs', () => {
    const context = buildResumeContext(fixture(), { generalizeOrganizations: true });
    expect(context.experiences[0]?.company).toBe('公司 1');
    expect(context.education[0]?.school).toBe('学校 1');
    const sources = contextSources(context);
    expect(sources['experiences.e1.description']).toBe('负责接口');
    expect(() => aiReferences(['projects.p1.description'], Object.keys(sources))).toThrow('来源');
    expect(() => aiReferences(['basic.summary', 'basic.summary'], Object.keys(sources))).toThrow('来源');
  });
  it('excludes modules removed from the preview order even when not explicitly hidden', () => {
    const r = fixture();
    r.sectionOrder = ['skills'];
    const context = buildResumeContext(r);
    expect(context.experiences).toEqual([]);
    expect(context.education).toEqual([]);
    expect(context.customBlocks).toEqual([]);
    expect(JSON.stringify(context)).not.toContain('真实公司');
  });
});

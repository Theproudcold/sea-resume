import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, type PropType } from 'vue';
import { ElIcon } from 'element-plus';
import type { ResumeData } from '@/types/resume';
import { useResumeStore } from '@/stores/resume';
import draggable from 'vuedraggable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { resumeToMarkdown } from '@/utils/markdown/exportResumeMarkdown';
import { templateRegistry } from '../template-registry';

// Exercise the producer → consumer boundary, not six hand-crafted template fixtures.
// Keep draggable real: stubbing it to `true` discards its item slot and hides field loss.
const markdown = `# 契约测试用户 | 工程师
- **QQ**：123456789

## 工作经历
### 测试公司 | 开发工程师 | 2022.01 — 至今
负责可检索的业务正文。
- 独立成果标记：交付自动化工具

## 项目经历
### 测试项目 | 负责人 | 2024.01 — 至今
负责项目正文契约。
- 项目成果标记：保留列表正文

## 教育背景
### 测试大学 | 学士 | 软件工程 | 2018.09 — 2022.06
GPA：3.8/4.0
`;
const body = '负责可检索的业务正文。';
const highlight = '独立成果标记：交付自动化工具';

function fixture() {
  const result = parseResumeMarkdown(markdown, 'contract.md');
  expect(result.resume.experiences[0]?.highlights).toEqual([highlight]);
  expect(result.resume.education[0]?.gpa).toBe('3.8/4.0');
  expect(result.resume.basic.customContacts).toEqual([
    expect.objectContaining({ label: 'QQ', value: '123456789' }),
  ]);
  return result.resume;
}

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());
beforeEach(() => setActivePinia(createPinia()));

describe.each(Object.entries(templateRegistry))('Markdown → %s template contract', (id, component) => {
  async function render() {
    const data = fixture();
    data.templateId = id;
    // VTU cannot safely setProps/unmount an async component mounted as the root.
    // A synchronous host preserves the real async registry/child and owns the props.
    const Host = defineComponent({
      props: { data: { type: Object as PropType<ResumeData>, required: true } },
      setup: (props) => () => h(component, { data: props.data }),
    });
    const wrapper = mount(Host, { props: { data }, global: { components: { ElIcon } } });
    await vi.waitFor(async () => {
      await flushPromises();
      expect(wrapper.text()).toContain('契约测试用户');
    }, { timeout: 3000 });
    return { wrapper, data };
  }

  it('renders imported body, highlights and numeric contacts exactly once', async () => {
    const { wrapper } = await render();
    for (const value of [body, highlight, '123456789', '负责项目正文契约。', '项目成果标记：保留列表正文']) {
      expect(wrapper.text().split(value).length - 1, `${id}: ${value}`).toBe(1);
    }
    // GPA rendering is an existing ai-agent capability, not promised by the other layouts.
    if (id === 'ai-agent') expect(wrapper.text()).toContain('3.8/4.0');
  });

  it.each(['entry', 'section'] as const)('omits hidden non-empty %s content in preview and Markdown', async (kind) => {
    const { wrapper, data } = await render();
    expect(wrapper.text()).toContain(highlight); // Positive control: the consumer really rendered it.
    const hidden = structuredClone(data);
    if (kind === 'entry') hidden.experiences[0]!.visible = false;
    else hidden.hiddenSections = ['experience'];
    await wrapper.setProps({ data: hidden });
    await flushPromises();
    for (const output of [wrapper.text(), resumeToMarkdown(hidden)]) {
      expect(output).not.toContain(body);
      expect(output).not.toContain(highlight);
      expect(output).toContain('123456789');
      expect(output).toContain('测试大学');
    }
    await wrapper.setProps({ data });
    expect(wrapper.text()).toContain(body);
    expect(wrapper.text()).toContain(highlight);
  });

  if (id === 'professional') {
    it('preserves hidden section IDs when reordering the visible main column', async () => {
      const { wrapper, data } = await render();
      await wrapper.setProps({ data: { ...data, hiddenSections: ['experience'] } });
      const updateOrder = vi.spyOn(useResumeStore(), 'updateSectionOrder');
      wrapper.getComponent(draggable).vm.$emit('update:modelValue', ['projects']);
      expect(updateOrder).toHaveBeenCalledWith(['projects', 'experience', 'education', 'skills']);
    });
  }
});

import { defineComponent, h, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const resume = reactive({ id: 'resume-1', basic: {}, title: '简历' });
vi.mock('@/stores/resume', () => ({
  useResumeStore: () => ({
    data: resume,
    exportData: () => JSON.parse(JSON.stringify(resume)),
    applyChangeProposal: vi.fn(),
  }),
}));

import ExternalAiPanel from '@/components/ai/ExternalAiPanel.vue';

const Passthrough = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()); } });
const stubs = {
  'el-drawer': Passthrough, 'el-alert': Passthrough, 'el-tag': Passthrough, 'el-button': Passthrough,
  'el-collapse': Passthrough, 'el-collapse-item': Passthrough,
};

describe('外部 AI 文件交换', () => {
  it('只提供文件交换，并把实时连接指向简历主页', () => {
    const wrapper = mount(ExternalAiPanel, { props: { visible: true }, global: { stubs } });
    expect(wrapper.text()).toContain('简历主页');
    expect(wrapper.text()).toContain('下载 AI 工作区');
    expect(wrapper.text()).not.toContain('启用 MCP 桥接');
    wrapper.unmount();
  });
});

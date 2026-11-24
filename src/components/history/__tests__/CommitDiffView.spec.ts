import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CommitDiffView from '../CommitDiffView.vue';
import type { CommitDiff } from '@/services/history/diff';

function diff(overrides: Partial<CommitDiff> = {}): CommitDiff {
  return {
    fromHash: 'a',
    toHash: 'b',
    initial: false,
    truncated: false,
    stats: { additions: 1, deletions: 1, sections: ['工作经历'] },
    hunks: [{
      id: 'h1',
      section: '工作经历',
      label: 'Acme · 工作内容',
      type: 'modified',
      lines: [
        { kind: 'del', text: '负责前端开发' },
        { kind: 'add', text: '主导前端架构' },
        { kind: 'context', text: '维护构建工具' },
      ],
    }],
    ...overrides,
  };
}

describe('CommitDiffView', () => {
  it('renders line markers, sections and stats', () => {
    const wrapper = mount(CommitDiffView, { props: { diff: diff() } });
    expect(wrapper.text()).toContain('工作经历');
    expect(wrapper.text()).toContain('+1');
    expect(wrapper.text()).toContain('−1');
    expect(wrapper.findAll('.diff-line.is-del')).toHaveLength(1);
    expect(wrapper.findAll('.diff-line.is-add')).toHaveLength(1);
    expect(wrapper.findAll('.diff-line.is-context')).toHaveLength(1);
    expect(wrapper.text()).toContain('主导前端架构');
  });

  it('explains initial versions and formatted-only changes', () => {
    const initial = mount(CommitDiffView, {
      props: { diff: diff({ initial: true, hunks: [], stats: { additions: 3, deletions: 0, sections: ['个人信息'] } }) },
    });
    expect(initial.text()).toContain('第一个版本');

    const formatted = mount(CommitDiffView, {
      props: {
        diff: diff({
          hunks: [{
            id: 'f1', section: '工作经历', label: '格式', type: 'formatted', lines: [],
            note: '格式变化（加粗、链接、列表等），可见文字未变。',
          }],
        }),
      },
    });
    expect(formatted.text()).toContain('格式变化');
  });
});

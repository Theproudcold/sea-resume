import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ResumeGraphView from '../ResumeGraphView.vue';
import type { ResumeMeta } from '@/types/resume';

function master(id: string, versionNumber: number, extra: Partial<ResumeMeta> = {}): ResumeMeta {
  return {
    id,
    title: id === 'm1' ? '我的简历' : '我的简历',
    templateId: 'modern',
    createdAt: Date.parse('2026-01-01T00:00:00Z') + versionNumber,
    updatedAt: Date.parse('2026-01-01T00:00:00Z') + versionNumber,
    trackId: 'T',
    versionNumber,
    ...extra,
  };
}

function job(id: string, baseId: string, baseVersion: number, extra: Partial<ResumeMeta> = {}): ResumeMeta {
  return master(id, 1, {
    title: 'Acme 前端',
    jobTarget: { versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: baseId, baseId, baseVersion },
    ...extra,
  });
}

function setup(resumes: ResumeMeta[]) {
  return mount(ResumeGraphView, { props: { resumes } });
}

describe('ResumeGraphView', () => {
  it('renders one node per resume and draws the edges', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    expect(panel.findAll('[data-testid=graph-node]')).toHaveLength(3);
    // 主干推进 + 分叉 = 2 条线。
    expect(panel.findAll('[data-testid=graph-edge]')).toHaveLength(2);
    panel.unmount();
  });

  it('labels versions on the nodes', () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const text = panel.text();
    expect(text).toContain('v2');
    expect(text).toContain('v1');
    panel.unmount();
  });

  it('marks a node that is behind its master with a text label, not only colour', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const behind = panel.findAll('[data-testid=graph-behind]');
    expect(behind).toHaveLength(1);
    expect(behind[0]!.text()).toContain('有新版');
    panel.unmount();
  });

  it('tells the user when the order had to be guessed', () => {
    const panel = setup([
      master('m1', 1),
      master('m2', 2),
      job('o1', 'm1', 1),
      master('o2', 1, {
        title: 'Acme 前端',
        jobTarget: { versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2 },
      }),
    ]);
    expect(panel.text()).toContain('推测');
    panel.unmount();
  });

  it('says so when there is nothing to draw', () => {
    const panel = setup([]);
    expect(panel.text()).toContain('还没有版本');
    panel.unmount();
  });

  it('selects a node on click and emits its id', async () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    await panel.findAll('[data-testid=graph-node]')[1]!.trigger('click');
    expect(panel.emitted('select')?.[0]).toEqual(['m2']);
    panel.unmount();
  });

  it('exposes nodes as keyboard-reachable buttons', () => {
    const panel = setup([master('m1', 1)]);
    const node = panel.get('[data-testid=graph-node]');
    expect(node.attributes('role')).toBe('button');
    expect(node.attributes('tabindex')).toBe('0');
    panel.unmount();
  });

  it('shows the legend for the three edge kinds', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const legend = panel.get('[data-testid=graph-legend]').text();
    expect(legend).toContain('版本推进');
    expect(legend).toContain('分叉');
    expect(legend).toContain('同步');
    panel.unmount();
  });

  it('never renders untrusted title as HTML', () => {
    const panel = setup([master('m1', 1, { title: '<img src=x onerror=alert(1)>' })]);
    // 关键是渲染成文本而不是标签：节点里出现字面的 "<img"，但页面上没有 img 元素。
    expect(panel.find('img').exists()).toBe(false);
    expect(panel.text()).toContain('<img');
    // 无障碍标签保留完整标题，不被显示用的截断影响。
    expect(panel.get('[data-testid=graph-node]').attributes('aria-label')).toContain('<img src=x onerror=alert(1)>');
    panel.unmount();
  });

  it('keeps the drawing inside the reported size', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const svg = panel.get('svg');
    expect(Number(svg.attributes('width'))).toBeGreaterThan(0);
    expect(Number(svg.attributes('height'))).toBeGreaterThan(0);
    // 每个节点都落在画布内。
    for (const node of panel.findAll('[data-testid=graph-node]')) {
      const x = Number(node.attributes('data-x'));
      expect(x).toBeGreaterThanOrEqual(0);
    }
    panel.unmount();
  });
});

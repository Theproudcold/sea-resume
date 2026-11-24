import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResumeGraphView from '../ResumeGraphView.vue';
import type { ResumeMeta } from '@/types/resume';

const T0 = Date.parse('2026-01-01T00:00:00Z');

function master(id: string, versionNumber: number, extra: Partial<ResumeMeta> = {}): ResumeMeta {
  return {
    id,
    title: '我的简历',
    templateId: 'modern',
    createdAt: T0,
    updatedAt: T0 + versionNumber,
    trackId: 'T',
    versionNumber,
    ...extra,
  };
}

function job(
  id: string,
  baseId: string,
  baseVersion: number,
  extra: Partial<ResumeMeta> & { company?: string; position?: string; rebasedFromId?: string } = {},
): ResumeMeta {
  const { company = 'Acme', position = '前端工程师', rebasedFromId, ...rest } = extra;
  return master(id, 1, {
    title: `${company} ${position}`,
    jobTarget: {
      versionName: `${company} ${position}`,
      company,
      position,
      sourceResumeId: baseId,
      baseId,
      baseVersion,
      ...(rebasedFromId ? { rebasedFromId } : {}),
    },
    ...rest,
  });
}

function setup(resumes: ResumeMeta[]) {
  return mount(ResumeGraphView, { props: { resumes } });
}

describe('ResumeGraphView', () => {
  it('renders one dot per resume and draws the edges', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    expect(panel.findAll('[data-testid=graph-node]')).toHaveLength(3);
    expect(panel.findAll('[data-testid=graph-node] circle')).toHaveLength(3);
    expect(panel.findAll('[data-testid=graph-edge]')).toHaveLength(2);
    panel.unmount();
  });

  it('labels versions under each dot', () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const text = panel.text();
    expect(text).toContain('v1');
    expect(text).toContain('v2');
    panel.unmount();
  });

  it('marks a node that is behind its master with a text label, not only colour', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const behind = panel.findAll('[data-testid=graph-behind]');
    expect(behind).toHaveLength(1);
    expect(behind[0]!.text()).toContain('主干有新版');
    panel.unmount();
  });

  it('says so when a job has no master to attach to', () => {
    const panel = setup([master('m1', 1), job('lost', 'missing', 1, { trackId: 'OTHER' })]);
    expect(panel.find('[data-testid=graph-orphan]').exists()).toBe(true);
    expect(panel.text()).toContain('找不到主干');
    panel.unmount();
  });

  it('tells the user when the order had to be guessed', () => {
    const panel = setup([
      master('m1', 1), master('m2', 2),
      job('o1', 'm1', 1),
      job('o2', 'm2', 2, { rebasedFromId: undefined }),
    ]);
    expect(panel.find('[data-testid=graph-uncertain]').exists()).toBe(true);
    panel.unmount();
  });

  it('says so when there is nothing to draw', () => {
    const panel = setup([]);
    expect(panel.text()).toContain('还没有版本');
    panel.unmount();
  });

  it('selects a node on click and emits its id', async () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const nodes = panel.findAll('[data-testid=graph-node]');
    await nodes[0]!.trigger('click');
    expect(panel.emitted('select')).toHaveLength(1);
    panel.unmount();
  });

  it('exposes nodes as keyboard-reachable buttons', () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const node = panel.get('[data-testid=graph-node]');
    expect(node.attributes('role')).toBe('button');
    expect(node.attributes('tabindex')).toBe('0');
    panel.unmount();
  });

  it('shows the legend for dots and the three edge kinds', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const legend = panel.get('[data-testid=graph-legend]').text();
    expect(legend).toContain('主干版本');
    expect(legend).toContain('岗位版本');
    expect(legend).toContain('版本推进');
    expect(legend).toContain('从主干分出');
    expect(legend).toContain('同步主干');
    panel.unmount();
  });

  it('never renders untrusted title as HTML', () => {
    const panel = setup([master('m1', 1, { title: '<img src=x onerror=alert(1)>' }), master('m2', 2)]);
    expect(panel.find('img').exists()).toBe(false);
    expect(panel.text()).toContain('<img');
    expect(panel.get('[data-testid=graph-node]').attributes('aria-label')).toContain('<img src=x onerror=alert(1)>');
    panel.unmount();
  });

  it('keeps the drawing inside the reported size', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('b1', 'm1', 1)]);
    const svg = panel.get('svg');
    expect(Number(svg.attributes('width'))).toBeGreaterThan(0);
    expect(Number(svg.attributes('height'))).toBeGreaterThan(0);
    for (const node of panel.findAll('[data-testid=graph-node]')) {
      expect(Number(node.attributes('data-x'))).toBeGreaterThanOrEqual(0);
    }
    panel.unmount();
  });

  it('explains that unrelated resumes are not drawn', () => {
    const many = [
      ...Array.from({ length: 5 }, (_, index) => master(`x${index}`, 1, { trackId: `T${index}`, title: `独立${index}` })),
      master('m1', 1),
      master('m2', 2),
    ];
    const panel = setup(many);
    expect(panel.text()).toContain('另有 5 份独立简历');
    panel.unmount();
  });

  it('draws master progress as a straight vertical line', () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const d = panel.get('[data-testid=graph-edge]').attributes('d')!;
    expect(d).toMatch(/^M (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) L (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/);
    const m = d.match(/^M (\S+) (\S+) L (\S+) (\S+)$/)!;
    expect(m[1]).toBe(m[3]);
    panel.unmount();
  });

  it('never lets an edge end inside a node circle', () => {
    const panel = setup([
      master('m1', 1), master('m2', 2), master('m3', 3),
      job('j1', 'm1', 1),
      job('j2', 'm3', 3, { rebasedFromId: 'j1' }),
    ]);
    const centers = panel.findAll('[data-testid=graph-node] circle').map((c) => ({
      x: Number(c.attributes('cx')),
      y: Number(c.attributes('cy')),
      r: Number(c.attributes('r')),
    }));
    const points = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    for (const edge of panel.findAll('[data-testid=graph-edge]')) {
      const pts = points(edge.attributes('d') ?? '');
      for (const [px, py] of [pts[0]!, pts[pts.length - 1]!]) {
        for (const c of centers) {
          expect(Math.hypot(px - c.x, py - c.y)).toBeGreaterThanOrEqual(c.r);
        }
      }
    }
    panel.unmount();
  });
});

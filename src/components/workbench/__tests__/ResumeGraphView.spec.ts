import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResumeGraphView from '../ResumeGraphView.vue';
import type { ResumeMeta } from '@/types/resume';

const T0 = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86_400_000;

function master(id: string, versionNumber: number, extra: Partial<ResumeMeta> = {}, days = versionNumber): ResumeMeta {
  return {
    id,
    title: '我的简历',
    templateId: 'modern',
    createdAt: T0,
    updatedAt: T0 + days * DAY,
    trackId: 'T',
    versionNumber,
    ...extra,
  };
}

function job(
  id: string,
  baseId: string,
  baseVersion: number,
  extra: { trackId?: string; company?: string; rebasedFromId?: string; days?: number } = {},
): ResumeMeta {
  const company = extra.company ?? 'Acme';
  return master(id, 1, {
    title: `${company} 前端`,
    jobTarget: {
      versionName: `${company} 前端`,
      company,
      position: '前端工程师',
      sourceResumeId: baseId,
      baseId,
      baseVersion,
      ...(extra.rebasedFromId ? { rebasedFromId: extra.rebasedFromId } : {}),
    },
    ...(extra.trackId ? { trackId: extra.trackId } : {}),
  }, extra.days ?? 10);
}

function setup(resumes: ResumeMeta[]) {
  return mount(ResumeGraphView, { props: { resumes } });
}

function pathX(path: string, end: 'start' | 'end'): number {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return end === 'start' ? nums[0]! : nums[nums.length - 2]!;
}

describe('ResumeGraphView 行式布局', () => {
  it('renders one row per resume, each with a rail and an info line', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    expect(panel.findAll('[data-testid=graph-row]')).toHaveLength(3);
    expect(panel.findAll('[data-testid=graph-rail]')).toHaveLength(3);
    expect(panel.findAll('[data-testid=graph-dot]')).toHaveLength(3);
    expect(panel.findAll('[data-testid=graph-node]')).toHaveLength(3);
    panel.unmount();
  });

  it('orders rows newest first', () => {
    const panel = setup([master('m1', 1), master('m3', 3), master('m2', 2)]);
    const titles = panel.findAll('.info-version').map((el) => el.text());
    expect(titles[0]).toBe('v3');
    panel.unmount();
  });

  it('shows the job company and position on branch rows', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    expect(panel.text()).toContain('Acme');
    expect(panel.text()).toContain('前端工程师');
    panel.unmount();
  });

  it('draws rail lines for relations', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    expect(panel.findAll('[data-testid=graph-edge]').length).toBeGreaterThan(0);
    panel.unmount();
  });

  it('marks a node that is behind with a text label, not only colour', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const behind = panel.findAll('[data-testid=graph-behind]');
    expect(behind).toHaveLength(1);
    expect(behind[0]!.text()).toContain('主干有新版');
    panel.unmount();
  });

  it('keeps the dot inside the rail width', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const railWidth = Number(panel.get('[data-testid=graph-rail]').attributes('width'));
    for (const dot of panel.findAll('[data-testid=graph-dot]')) {
      expect(Number(dot.attributes('cx'))).toBeLessThan(railWidth);
      expect(Number(dot.attributes('cx'))).toBeGreaterThan(0);
    }
    panel.unmount();
  });

  it('keeps a long sync chain inside the rail', () => {
    const chain = Array.from({ length: 6 }, (_, index) => job(`j${index}`, 'm1', 1, {
      rebasedFromId: index === 0 ? undefined : `j${index - 1}`,
      days: 10 + index,
    }));
    const panel = setup([master('m1', 1, {}, 1), ...chain]);
    const railWidth = Number(panel.get('[data-testid=graph-rail]').attributes('width'));
    for (const dot of panel.findAll('[data-testid=graph-dot]')) {
      expect(Number(dot.attributes('cx')) + 5).toBeLessThanOrEqual(railWidth);
    }
    panel.unmount();
  });

  it('keeps a sync line on one x while it crosses the rows in between', () => {
    const panel = setup([
      master('m1', 1, {}, 1),
      master('m3', 3, {}, 3),
      job('j1', 'm1', 1, { days: 4 }),
      job('j2', 'm1', 3, { rebasedFromId: 'j1', days: 5 }),
    ]);
    const row = (id: string) => panel.get(`[data-id=${id}]`);
    const exitX = pathX(row('j2').get('[data-side=below]').attributes('d')!, 'end');
    const throughX = Number(row('j1').get('[data-testid=graph-pass]').attributes('x1'));
    const entryX = pathX(row('m3').get('[data-side=above]').attributes('d')!, 'start');
    expect(throughX).toBe(exitX);
    expect(entryX).toBe(exitX);
    panel.unmount();
  });

  it('says so when a job has no master to attach to', () => {
    const panel = setup([master('m1', 1), job('lost', 'missing', 1, { trackId: 'OTHER' })]);
    expect(panel.find('[data-testid=graph-orphan]').exists()).toBe(true);
    expect(panel.text()).toContain('找不到主干');
    panel.unmount();
  });

  it('says so when there is nothing to draw', () => {
    const panel = setup([]);
    expect(panel.text()).toContain('还没有版本');
    panel.unmount();
  });

  it('selects a row and emits its id', async () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    await panel.findAll('[data-testid=graph-node]')[0]!.trigger('click');
    expect(panel.emitted('select')).toHaveLength(1);
    panel.unmount();
  });

  it('exposes the info line as a real button', () => {
    const panel = setup([master('m1', 1), master('m2', 2)]);
    const info = panel.get('[data-testid=graph-node]');
    expect(info.element.tagName).toBe('BUTTON');
    expect(info.attributes('aria-label')).toBeTruthy();
    panel.unmount();
  });

  it('shows the legend', () => {
    const panel = setup([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const legend = panel.get('[data-testid=graph-legend]').text();
    expect(legend).toContain('版本节点');
    expect(legend).toContain('版本推进');
    expect(legend).toContain('从主干分出');
    expect(legend).toContain('同步主干');
    panel.unmount();
  });

  it('never renders an untrusted title as HTML', () => {
    const panel = setup([master('m1', 1, { title: '<img src=x onerror=alert(1)>' }), master('m2', 2)]);
    expect(panel.find('img').exists()).toBe(false);
    expect(panel.text()).toContain('<img');
    panel.unmount();
  });

  it('filters standalone resumes out of the list', () => {
    const many = [
      ...Array.from({ length: 4 }, (_, index) => master(`s${index}`, 1, { trackId: `S${index}`, title: `独立${index}` })),
      master('m1', 1), master('m2', 2),
    ];
    const panel = setup(many);
    expect(panel.findAll('[data-testid=graph-row]')).toHaveLength(2);
    panel.unmount();
  });
});

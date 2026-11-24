import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import JdRiskPanel from '../JdRiskPanel.vue';

const JD = [
  '岗位职责：负责核心交易系统的研发与稳定性建设。',
  '任职要求：本科以上学历，抗压能力强，能适应加班。',
  '薪资面议，期权激励丰厚。',
  '本岗位为劳务派遣。',
].join('\n');

function setup() {
  return mount(JdRiskPanel);
}

describe('JdRiskPanel', () => {
  it('starts empty and explains it sends nothing', () => {
    const panel = setup();
    expect(panel.text()).toContain('不会发送');
    expect(panel.findAll('[data-testid=jd-risk-hit]')).toHaveLength(0);
    panel.unmount();
  });

  it('scans locally as the user types, one hit per category', async () => {
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue(JD);
    const hits = panel.findAll('[data-testid=jd-risk-hit]');
    // 「抗压能力强」与「能适应加班」同属加班类别，只报一次。
    expect(hits.length).toBe(3);
    const text = hits.map((hit) => hit.text()).join('\n');
    expect(text).toContain('加班 / 强度');
    expect(text).toContain('薪酬 / 福利');
    expect(text).toContain('用工性质');
    expect(text).toContain('团队过去一个季度的平均下班时间');
    panel.unmount();
  });

  it('groups by severity with visible labels, not colour alone', async () => {
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue(JD);
    const groups = panel.findAll('[data-testid=jd-risk-group]');
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.text()).toMatch(/值得留意|需要核实|直接影响/);
    panel.unmount();
  });

  it('shows the verbatim JD excerpt so the user can verify', async () => {
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue(JD);
    const excerpt = panel.get('[data-testid=jd-risk-hit] [data-testid=jd-risk-excerpt]').text();
    expect(JD.replace(/\n/g, '')).toContain(excerpt.replace(/\s+/g, ' ').trim().slice(0, 10));
    panel.unmount();
  });

  it('says clearly that no hit is not a safety verdict', async () => {
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue('负责核心交易系统的研发与稳定性建设。');
    expect(panel.findAll('[data-testid=jd-risk-hit]')).toHaveLength(0);
    expect(panel.text()).toContain('不代表岗位安全');
    panel.unmount();
  });

  it('warns instead of failing when the JD exceeds the limit', async () => {
    const panel = setup();
    // 每次 6 字，4000 次共 24000 字，超过 20000 字上限。
    await panel.get('[data-testid=jd-risk-input]').setValue('抗压能力强。'.repeat(4000));
    expect(panel.text()).toContain('超过 20000 字');
    expect(panel.findAll('[data-testid=jd-risk-hit]').length).toBeGreaterThan(0);
    panel.unmount();
  });

  it('copies a single interview question', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue(JD);
    await panel.get('[data-testid=jd-risk-copy]').trigger('click');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain('团队过去一个季度的平均下班时间');
    panel.unmount();
  });

  it('clears the result when the JD is emptied', async () => {
    const panel = setup();
    const input = panel.get('[data-testid=jd-risk-input]');
    await input.setValue(JD);
    expect(panel.findAll('[data-testid=jd-risk-hit]').length).toBeGreaterThan(0);
    await input.setValue('');
    expect(panel.findAll('[data-testid=jd-risk-hit]')).toHaveLength(0);
    panel.unmount();
  });

  it('does not flag a negated phrase typed by the user', async () => {
    const panel = setup();
    await panel.get('[data-testid=jd-risk-input]').setValue('本岗位非外包，与公司直签，不需要加班。');
    expect(panel.findAll('[data-testid=jd-risk-hit]')).toHaveLength(0);
    panel.unmount();
  });
});

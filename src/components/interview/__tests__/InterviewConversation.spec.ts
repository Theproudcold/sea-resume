import { afterEach, describe, expect, it } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ElButton, ElIcon } from 'element-plus';
import InterviewConversation from '../InterviewConversation.vue';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { InterviewSession } from '@/types/interview';
let wrapper: VueWrapper | undefined;
function session(): InterviewSession {
  return { id: 's1', sourceResumeId: 'r1', context: buildResumeContext(parseResumeMarkdown('# Test').resume), settings: { targetRole: '工程师', jd: '', level: '初级', direction: '综合', mode: 'training', mainQuestionLimit: 5 }, provider: { baseUrl: 'https://test.invalid/v1', model: 'mock' }, status: 'answering', pendingStage: null, coveragePlan: [], turns: [{ id: 'q1', mainNumber: 1, followup: false, question: { text: '你负责什么？', focus: '职责', kind: 'experience', itemIds: [] } }], createdAt: '', updatedAt: '', usage: { calls: 1, promptTokens: 0, completionTokens: 0 }, persistence: false, jsonMode: true, ending: false };
}
function render(s = session(), consented = true) {
  wrapper = mount(InterviewConversation, { attachTo: document.body, props: { session: s, busy: false, consented }, global: { components: { ElButton, ElIcon } } });
  return wrapper;
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; });
describe('polished interview interaction', () => {
  it('blocks blank submissions and composing shortcuts, submits raw text after composition ends', async () => {
    const panel = render(); const input = panel.get('textarea');
    await input.setValue('  '); await panel.get('form').trigger('submit'); expect(panel.emitted('answer')).toBeUndefined();
    await input.setValue('我负责缓存验证。'); await input.trigger('compositionstart');
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true }); expect(panel.emitted('answer')).toBeUndefined();
    await input.trigger('compositionend'); await input.trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(panel.emitted('answer')).toEqual([['我负责缓存验证。', false]]);
    expect(panel.text()).toContain('8 / 10,000');
  });
  it('does not submit on a normal Enter and supports an explicit skip', async () => {
    const panel = render(); await panel.get('textarea').setValue('真实回答');
    await panel.get('textarea').trigger('keydown', { key: 'Enter' }); expect(panel.emitted('answer')).toBeUndefined();
    await panel.findAll('button').find(b => b.text() === '跳过此题')!.trigger('click');
    expect(panel.emitted('answer')).toEqual([['真实回答', true]]);
  });
  it('keeps the draft while paused and blocks actions without consent', async () => {
    const s = session(); const panel = render(s); await panel.get('textarea').setValue('还没提交的草稿');
    await panel.setProps({ session: { ...s, status: 'paused' } }); expect(panel.find('textarea').exists()).toBe(false);
    await panel.setProps({ session: { ...s }, consented: false });
    expect((panel.get('textarea').element as HTMLTextAreaElement).value).toBe('还没提交的草稿');
    expect(panel.get('textarea').attributes('disabled')).toBeDefined();
    await panel.get('form').trigger('submit'); expect(panel.emitted('answer')).toBeUndefined();
  });
  it('uses mode-specific feedback and locates the next question only after an explicit continue', async () => {
    const s = session(); s.status = 'reviewing'; s.settings.mode = 'real'; s.turns[0]!.answer = '原回答'; s.turns[0]!.submittedAt = 'now';
    const panel = render(s); expect(panel.text()).toContain('本轮不展示中途点评');
    await panel.findAll('button').find(b => b.text() === '继续下一题 / 追问')!.trigger('click');
    expect(panel.emitted('continue')).toHaveLength(1);
    await panel.setProps({ session: { ...s, status: 'answering', turns: [...s.turns, { id: 'q2', mainNumber: 1, followup: true, question: { text: '如何验证？', focus: '验证', kind: 'experience', itemIds: [] } }] } });
    await flushPromises(); expect(document.activeElement).toBe(panel.get('[data-current=true] .question-text').element);
    expect(panel.text()).toContain('追问 1/1');
  });
});

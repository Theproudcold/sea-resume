import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessage, ElMessageBox } from 'element-plus';
import TemplateGallery from '@/views/TemplateGallery.vue';
import { useResumeStore } from '@/stores/resume';
import { useTemplateStore } from '@/stores/template';
import { useWorkbenchStore } from '@/stores/workbench';
import { templateDemoData } from '@/data/template-demo';

const { query, push, routeGuards } = vi.hoisted(() => ({ query: {} as Record<string, string>, push: vi.fn(), routeGuards: {} as { leave?: () => boolean; update?: () => boolean } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query }), useRouter: () => ({ push }),
  onBeforeRouteLeave: (guard: () => boolean) => { routeGuards.leave = guard; },
  onBeforeRouteUpdate: (guard: () => boolean) => { routeGuards.update = guard; },
}));

const stubs = {
  TemplateGalleryHeader: true,
  TemplateGalleryToolbar: true,
  TemplateCard: {
    props: ['template', 'disabled'],
    emits: ['select', 'preview'],
    template: '<article :data-template="template.id"><button class="select-template" :disabled="disabled" @click="$emit(\'select\')">使用</button><button class="preview-template" @click="$emit(\'preview\')">预览</button></article>',
  },
  TemplatePreviewDialog: {
    props: ['visible'],
    emits: ['apply', 'create'],
    template: '<aside v-if="visible" class="preview"><button class="apply-template" @click="$emit(\'apply\')">应用</button><button class="create-template" @click="$emit(\'create\')">新建</button></aside>',
  },
  ElEmpty: { template: '<div><slot /></div>' },
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
};
const mountGallery = () => mount(TemplateGallery, { global: { stubs } });

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  delete query.resumeId;
  push.mockReset();
  useResumeStore().$patch({ data: { ...structuredClone(templateDemoData), id: 'current' } });
  vi.spyOn(useTemplateStore(), 'loadCustomTemplates').mockImplementation(() => {});
  vi.spyOn(useWorkbenchStore(), 'createResume').mockResolvedValue('new-resume');
  vi.spyOn(useResumeStore(), 'setTemplate').mockImplementation(() => {});
  vi.spyOn(useResumeStore(), 'applyTemplateSnapshot').mockImplementation(() => {});
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() } as never));
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn() } as never));
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
});
afterEach(() => vi.restoreAllMocks());

function addCustomTemplate() {
  useTemplateStore().customTemplates = [{
    id: 'custom-template', name: '我的模板', description: '已保存的内容', baseTemplateId: 'modern',
    createdAt: 1, updatedAt: 1, snapshot: structuredClone(templateDemoData),
  }];
}

describe('TemplateGallery actions', () => {
  it('creates directly from a builtin card without requiring a preview dialog', async () => {
    const wrapper = mountGallery();
    await wrapper.get('[data-template="modern"] .select-template').trigger('click');
    await flushPromises();
    expect(useWorkbenchStore().createResume).toHaveBeenCalledWith(expect.any(String), 'modern');
    expect(push).toHaveBeenCalledWith('/editor/new-resume');
    expect(wrapper.find('.preview').exists()).toBe(false);
  });

  it('applies only the builtin layout without showing a destructive confirmation', async () => {
    query.resumeId = 'current';
    const wrapper = mountGallery();
    await wrapper.get('[data-template="professional"] .select-template').trigger('click');
    await flushPromises();
    expect(useResumeStore().setTemplate).toHaveBeenCalledWith('professional');
    expect(useResumeStore().applyTemplateSnapshot).not.toHaveBeenCalled();
    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
  });

  it('does not overwrite a resume when the custom-template confirmation is canceled', async () => {
    query.resumeId = 'current';
    addCustomTemplate();
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    const wrapper = mountGallery();
    await wrapper.get('[data-template="custom-template"] .preview-template').trigger('click');
    await wrapper.get('.apply-template').trigger('click');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('替换当前简历的内容'), '替换当前简历内容？', expect.objectContaining({ confirmButtonText: '确认替换' }));
    expect(useResumeStore().applyTemplateSnapshot).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(wrapper.find('.preview').exists()).toBe(true);
  });

  it('applies custom content only after explicit confirmation', async () => {
    query.resumeId = 'current';
    addCustomTemplate();
    const wrapper = mountGallery();
    await wrapper.get('[data-template="custom-template"] .preview-template').trigger('click');
    await wrapper.get('.apply-template').trigger('click');
    await flushPromises();
    expect(useResumeStore().applyTemplateSnapshot).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/editor/current');
  });

  it.each(['unmount', 'resume-change'])('ignores an old replacement confirmation after %s', async (change) => {
    query.resumeId = 'current';
    addCustomTemplate();
    let confirm!: () => void;
    vi.mocked(ElMessageBox.confirm).mockImplementationOnce(() => new Promise(resolve => { confirm = () => resolve('confirm' as never); }));
    const wrapper = mountGallery();
    await wrapper.get('[data-template="custom-template"] .select-template').trigger('click');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    if (change === 'unmount') wrapper.unmount();
    else useResumeStore().data.id = 'other-resume';
    confirm();
    await flushPromises();
    expect(useResumeStore().applyTemplateSnapshot).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    if (change !== 'unmount') wrapper.unmount();
  });

  it('blocks history navigation only until the replacement is confirmed or canceled', async () => {
    query.resumeId = 'current';
    addCustomTemplate();
    vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ close: vi.fn() } as never));
    let cancel!: () => void;
    vi.mocked(ElMessageBox.confirm).mockImplementationOnce(() => new Promise((_, reject) => { cancel = () => reject('cancel'); }));
    const wrapper = mountGallery();
    await wrapper.get('[data-template="custom-template"] .select-template').trigger('click');
    await flushPromises();
    expect(routeGuards.leave?.()).toBe(false);
    expect(routeGuards.update?.()).toBe(false);
    cancel();
    await flushPromises();
    expect(routeGuards.leave?.()).toBe(true);
    expect(routeGuards.update?.()).toBe(true);
    expect(useResumeStore().applyTemplateSnapshot).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('prevents duplicate creation while a template is being used', async () => {
    let finish!: (value: string) => void;
    vi.mocked(useWorkbenchStore().createResume).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const wrapper = mountGallery();
    await wrapper.get('[data-template="modern"] .select-template').trigger('click');
    await wrapper.get('[data-template="professional"] .select-template').trigger('click');
    expect(useWorkbenchStore().createResume).toHaveBeenCalledTimes(1);
    finish('new-resume');
    await flushPromises();
  });
});

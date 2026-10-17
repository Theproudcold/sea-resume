import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElDropdown, ElMessage } from 'element-plus';
import Editor from '@/views/Editor.vue';
import { useResumeStore } from '@/stores/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { exportToJSON } from '@/utils/export-json';

vi.mock('@/utils/export-json', () => ({ exportToJSON: vi.fn(), importFromJSON: vi.fn() }));

async function mountEditor() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useResumeStore();
  store.data.id = 'one';
  const load = vi.spyOn(store, 'loadResume').mockResolvedValue();
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/editor/:id', component: Editor }, { path: '/', component: { template: '<p>Home</p>' } },
  ] });
  await router.push('/editor/one');
  await router.isReady();
  const wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, ElementPlus],
    stubs: { EditorPanel: true, PreviewPanel: true, ResumeCanvas: true, ResumeQualityPanel: true },
  } });
  await flushPromises();
  return { store, router, wrapper, load };
}

afterEach(() => { ElMessage.closeAll(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('editor persistence boundaries', () => {
  it('flushes a pending draft before leaving the editor', async () => {
    const { store, router, wrapper } = await mountEditor();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    store.updateBasic({ name: 'Last draft' });
    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basic.name).toBe('Last draft');
    wrapper.unmount();
  });

  it('blocks leave and resume switches when a draft cannot be saved', async () => {
    const { store, router, wrapper, load } = await mountEditor();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(storageManager, 'save').mockRejectedValue(new Error('disk full'));
    const message = vi.spyOn(ElMessage, 'error');
    store.updateBasic({ name: 'Unsaved' });
    await router.push('/');
    expect(router.currentRoute.value.path).toBe('/editor/one');
    await router.push('/editor/two');
    expect(router.currentRoute.value.path).toBe('/editor/one');
    expect(load).toHaveBeenCalledTimes(1);
    expect(message).toHaveBeenCalledWith(expect.stringContaining('已留在编辑页'));
    store.cancelScheduledSave();
    wrapper.unmount();
  });

  it('waits for persistence before exporting and aborts exports on failure', async () => {
    const { store, wrapper } = await mountEditor();
    let finish!: () => void;
    const save = vi.spyOn(storageManager, 'save').mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    store.updateBasic({ name: 'Export draft' });
    wrapper.findAllComponents(ElDropdown).slice(-1)[0]!.vm.$emit('command', 'json');
    await flushPromises();
    expect(exportToJSON).not.toHaveBeenCalled();
    finish();
    await flushPromises();
    expect(exportToJSON).toHaveBeenCalledTimes(1);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    save.mockRejectedValue(new Error('offline'));
    store.updateBasic({ name: 'Failed draft' });
    wrapper.findAllComponents(ElDropdown).slice(-1)[0]!.vm.$emit('command', 'json');
    await flushPromises();
    expect(exportToJSON).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('flushes on hide and unregisters its listener when unmounted', async () => {
    const { store, wrapper } = await mountEditor();
    const flush = vi.spyOn(store, 'flushSave').mockResolvedValue();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import Workbench from '../Workbench.vue';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); ElMessage.closeAll(); vi.restoreAllMocks(); });

async function render(options: { error?: string; count?: number } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useWorkbenchStore();
  store.resumeList = Array.from({ length: options.count ?? 0 }, (_, i) => ({
    id: `resume-${i}`, title: `简历 ${i}`, templateId: 'modern', createdAt: i, updatedAt: i,
  }));
  vi.spyOn(useStorageStore(), 'init').mockResolvedValue();
  const init = vi.spyOn(store, 'init').mockImplementation(async () => { store.error = options.error || null; });
  const create = vi.spyOn(store, 'createResume').mockResolvedValue('new-resume');
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: Workbench },
    { path: '/editor/:id', component: { template: '<div>Editor</div>' } },
    { path: '/templates', component: { template: '<div>Templates</div>' } },
  ] });
  await router.push('/');
  wrapper = mount(Workbench, { global: {
    plugins: [pinia, router, ElementPlus],
    stubs: { SettingsCenter: true, ResumeCard: true, FullBackupManager: true, ResumeVersionManager: true, MarkdownImportDialog: true, AiPdfImportDialog: true },
  } });
  await flushPromises();
  return { store, init, create, router, wrapper };
}

function button(text: string) { return wrapper!.findAll('button').find(node => node.text() === text)!; }

describe('workbench primary user journeys', () => {
  it('creates a blank resume with one action and prevents duplicate requests', async () => {
    const { create, router } = await render();
    let finish!: (id: string) => void;
    create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await button('新建简历').trigger('click');
    await button('新建简历').trigger('click');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('未命名简历');
    finish('new-resume');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/editor/new-resume');
  });

  it('shows a recoverable error instead of pretending the library is empty', async () => {
    const { init } = await render({ error: '无法读取存储' });
    expect(wrapper!.find('.empty-board').exists()).toBe(false);
    expect(wrapper!.get('[role="alert"]').text()).toContain('暂时无法加载简历');
    init.mockImplementationOnce(async () => { useWorkbenchStore().error = null; });
    await button('重新加载').trigger('click');
    await flushPromises();
    expect(wrapper!.find('.load-error').exists()).toBe(false);
    expect(wrapper!.get('.empty-board').text()).toContain('创建你的第一份简历');
  });

  it('clears the old load error when storage is successfully reauthorized', async () => {
    const { init, store } = await render({ error: '原目录不可用' });
    const storage = useStorageStore();
    storage.initializationWarning = '需要重新授权';
    storage.hasFileSystemConfig = true;
    vi.spyOn(storage, 'reauthorizeFileSystem').mockResolvedValue('简历文件夹');
    init.mockImplementationOnce(async () => { store.error = null; });
    await flushPromises();
    await button('重新授权本地目录').trigger('click');
    await flushPromises();
    expect(wrapper!.find('.load-error').exists()).toBe(false);
    expect(wrapper!.find('.empty-board').exists()).toBe(true);
  });

  it('offers search with just two resumes and a way back from no results', async () => {
    await render({ count: 2 });
    await wrapper!.get('input[placeholder="按名称筛选"]').setValue('不存在');
    expect(wrapper!.get('.board-empty-filter').text()).toContain('没有找到');
    await button('清除搜索').trigger('click');
    expect(wrapper!.find('.board-empty-filter').exists()).toBe(false);
    expect(wrapper!.findAll('resume-card-stub')).toHaveLength(2);
  });

  it('keeps creation available after a failed save without leaving the page', async () => {
    const { create, router } = await render();
    create.mockRejectedValueOnce(new Error('磁盘空间不足'));
    await button('新建简历').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
    expect(button('新建简历').classes()).not.toContain('is-loading');
  });
});

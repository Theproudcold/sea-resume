import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessage } from 'element-plus';
import { templateDemoData } from '@/data/template-demo';
import { storageManager } from '@/services/storage/StorageManager';
import { useWorkbenchStore } from '@/stores/workbench';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { createFullBackup } from '@/utils/fullBackup';
import FullBackupManager from '@/components/workbench/FullBackupManager.vue';

const existing: ResumeData = { ...templateDemoData, id: 'existing-id', title: 'Shared title', basic: { ...templateDemoData.basic } };
const incoming: ResumeData = { ...templateDemoData, id: 'existing-id', title: 'Shared title', basic: { ...templateDemoData.basic } };
const secondIncoming: ResumeData = { ...templateDemoData, id: 'unique-incoming-id', title: 'Unique incoming', basic: { ...templateDemoData.basic } };
const meta: ResumeMeta = { id: existing.id, title: existing.title, templateId: existing.templateId, createdAt: 1, updatedAt: 1 };
const refreshMock = vi.fn();

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) { return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null; },
});
const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) { return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()); },
});
const AlertStub = defineComponent({
  setup(_, { slots }) { return () => h('div', [slots.title?.(), slots.default?.()]); },
});
const stubs = {
  'el-dialog': DialogStub,
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<section><slot /></section>' },
  'el-button': ButtonStub,
  'el-alert': AlertStub,
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { template: '<div>{{ description }}</div>', props: ['description'] },
};

function createWrapper() {
  return mount(FullBackupManager, { props: { modelValue: true }, global: { stubs } });
}

async function chooseBackup(wrapper: ReturnType<typeof createWrapper>, text: string, name = 'backup.json') {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File([text], name, { type: 'application/json' })],
  });
  await input.trigger('change');
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.restoreAllMocks();
  refreshMock.mockClear();
  setActivePinia(createPinia());
  vi.spyOn(storageManager, 'list').mockResolvedValue([meta]);
  vi.spyOn(storageManager, 'read').mockResolvedValue(existing);
  vi.spyOn(storageManager, 'save').mockResolvedValue();
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn(), bottom: 0 } as never));
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn(), bottom: 0 } as never));
  vi.spyOn(useWorkbenchStore(), 'refresh').mockImplementation(refreshMock);
});
afterEach(() => vi.restoreAllMocks());

describe('FullBackupManager', () => {
  it('previews conflicts then restores as a fresh copy without overwriting', async () => {
    const wrapper = createWrapper();
    await chooseBackup(wrapper, JSON.stringify(createFullBackup([incoming])));
    const preview = (wrapper.vm as any).$.setupState.preview;
    expect(preview.counts.idConflicts).toBe(1);
    expect(preview.counts.nameConflicts).toBe(1);

    await wrapper.findAll('button').find((button) => button.text().includes('按预览结果安全恢复'))?.trigger('click');
    await flushPromises();
    const restored = vi.mocked(storageManager.save).mock.calls[0]?.[0];
    expect(restored).toBeTruthy();
    expect(restored?.id).not.toBe(existing.id);
    expect(restored?.id).not.toBe(incoming.id);
    expect(restored?.title).not.toBe(existing.title);
    expect(storageManager.save).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalled();
  });

  it('does not duplicate completed resumes when resuming a partial restore', async () => {
    const wrapper = createWrapper();
    await chooseBackup(wrapper, JSON.stringify(createFullBackup([incoming, secondIncoming])));
    const save = vi.mocked(storageManager.save);
    save.mockResolvedValueOnce().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce();

    const restoreButton = () => wrapper.findAll('button').find((button) => button.text().includes('按预览结果安全恢复'));
    await restoreButton()?.trigger('click');
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect((wrapper.vm as any).$.setupState.errorMessage).toContain('新增 1 份');

    await restoreButton()?.trigger('click');
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(3);
    const calls = save.mock.calls.map(([resume]) => resume.id);
    expect(calls[2]).toBe(calls[1]);
    expect(calls[2]).not.toBe(calls[0]);
  });

  it('rejects invalid backup files before any write', async () => {
    const wrapper = createWrapper();
    await chooseBackup(wrapper, JSON.stringify({ format: 'not-a-sea-resume-backup', version: 1, resumes: [incoming] }));
    expect((wrapper.vm as any).$.setupState.errorMessage).toContain('supported full backup format');
    expect(storageManager.save).not.toHaveBeenCalled();
  });
  it('normalizes legacy stored resumes before validating backup conflicts', async () => {
    const legacy = {
      ...existing,
      theme: {
        color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5,
        spacing: 24, displayIcons: true,
      },
      customBlocks: [{ id: 'legacy-block', title: 'Legacy timeline', type: 'timeline', content: '<p>Old content</p>', order: 0 }],
    } as unknown as ResumeData;
    vi.mocked(storageManager.read).mockResolvedValue(legacy);
    const wrapper = createWrapper();

    await chooseBackup(wrapper, JSON.stringify(createFullBackup([secondIncoming])));

    const state = (wrapper.vm as any).$.setupState;
    expect(state.errorMessage).toBe('');
    expect(state.preview.items).toHaveLength(1);
  });
});

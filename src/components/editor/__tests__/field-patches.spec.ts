import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BasicInfoEditor from '../BasicInfoEditor.vue';
import ExperienceEditor from '../ExperienceEditor.vue';
import EducationEditor from '../EducationEditor.vue';
import ProjectEditor from '../ProjectEditor.vue';
import SkillEditor from '../SkillEditor.vue';
import CustomBlockEditor from '../CustomBlockEditor.vue';
import { useResumeStore } from '@/stores/resume';
import * as avatarImage from '@/utils/avatarImage';

const Field = defineComponent({
  name: 'TestField',
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
});
const Container = { template: '<div><slot /><slot name="label" /><slot name="reference" /></div>' };
const stubs = {
  'el-input': Field, 'el-select': Field, 'el-date-picker': Field, 'el-checkbox': Field, 'el-switch': Field,
  'el-form': Container, 'el-form-item': Container, 'el-row': Container, 'el-col': Container,
  'el-upload': { ...Container, name: 'TestUpload', props: ['onChange'] }, 'el-popover': Container, 'el-popconfirm': Container,
  MonthRangeField: defineComponent({ name: 'MonthRangeField', props: ['start', 'end', 'present'], emits: ['update:start', 'update:end', 'update:present'], template: '<div class="month-range" />' }),
  SkillTagInput: defineComponent({ name: 'SkillTagInput', props: ['items'], emits: ['update:items'], template: '<div class="skill-tags" />' }),
  EntryDeleteButton: { template: '<button class="entry-delete"><slot /></button>' },
  'el-icon': true, 'el-button': { template: '<button><slot /></button>' }, 'el-option': true, 'el-divider': true,
  RichTextEditor: Field, SmoothCollapse: Container,
};
const wrappers: VueWrapper[] = [];
const render = (component: any, props = {}) => {
  const wrapper = mount(component, { props, global: { stubs } });
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => {
  setActivePinia(createPinia());
  const store = useResumeStore();
  vi.spyOn(store, 'scheduleSave').mockImplementation(() => {});
  vi.spyOn(store, 'saveImmediately').mockImplementation(() => {});
  vi.spyOn(store, 'autoSave').mockResolvedValue();
  store.data.basic = { name: '原姓名', title: '', email: '', phone: '', customContacts: [{ id: 'c', label: '微信', value: '旧号码', icon: 'Link' }] };
  store.data.experiences = [{ id: 'e', company: '旧公司', position: '', startDate: '', endDate: 'present', description: '' }];
  store.data.education = [{ id: 'd', school: '旧学校', degree: '', major: '', startDate: '', endDate: '' }];
  store.data.projects = [{ id: 'p', name: '旧项目', role: '', startDate: '', endDate: 'present', description: '' }];
  store.data.skills = [{ id: 's', category: '语言', items: ['Vue'] }];
  store.data.customBlocks = [{ id: 'b', title: '自定义', type: 'list', order: 0, content: [{ id: 'i', title: '旧标题', description: '' }] }];
});
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('store-owned editor field patches', () => {
  it.each([
    { component: ExperienceEditor, list: 'experiences', action: 'updateExperience', field: 'company', old: '旧公司', id: 'e' },
    { component: EducationEditor, list: 'education', action: 'updateEducation', field: 'school', old: '旧学校', id: 'd' },
    { component: ProjectEditor, list: 'projects', action: 'updateProject', field: 'name', old: '旧项目', id: 'p' },
    { component: SkillEditor, list: 'skills', action: 'updateSkill', field: 'category', old: '语言', id: 's' },
  ] as const)('patches $list immediately with pre-edit history and stable list identity', async ({ component, list, action, field, old, id }) => {
    const store = useResumeStore();
    const originalList = store.data[list];
    let beforeAction: unknown;
    const unsubscribe = store.$onAction(({ name }) => {
      if (name === action) beforeAction = (store.data[list][0] as any)[field];
    });
    const patch = vi.spyOn(store, action);
    const wrapper = render(component);
    await wrapper.find('input').setValue('新内容');
    expect(beforeAction).toBe(old);
    expect(patch).toHaveBeenCalledExactlyOnceWith(id, { [field]: '新内容' });
    expect(store.data[list]).toBe(originalList);
    expect((store.historyPast[0]![list][0] as any)[field]).toBe(old);
    await store.undo();
    await nextTick();
    expect(wrapper.find('input').element.value).toBe(old);
    unsubscribe();
  });

  it('patches BasicInfo and contacts without mutating the previous objects', async () => {
    const store = useResumeStore();
    const previous = store.data.basic;
    const previousContact = previous.customContacts![0]!;
    const patch = vi.spyOn(store, 'updateBasic');
    const wrapper = render(BasicInfoEditor);
    await wrapper.find('input[placeholder="请输入姓名"]').setValue('新姓名');
    expect(patch).toHaveBeenLastCalledWith({ name: '新姓名' });
    expect(previous.name).toBe('原姓名');
    expect(store.historyPast[0]!.basic.name).toBe('原姓名');
    await wrapper.find('input[placeholder="填写联系方式内容"]').setValue('新号码');
    expect(previousContact.value).toBe('旧号码');
    expect(patch.mock.lastCall![0]).toEqual({ customContacts: [{ ...previousContact, value: '新号码' }] });
    await wrapper.find('button[aria-label="联系方式图标 Star"]').trigger('click');
    expect(previousContact.icon).toBe('Link');
    expect(store.data.basic.customContacts![0]!.icon).toBe('Star');
  });

  it.each(['resume switch', 'unmount', 'newer upload'] as const)('ignores stale avatar reads after %s', async (scenario) => {
    const pending: Array<{ resolve: (value: string) => void }> = [];
    vi.spyOn(avatarImage, 'compressAvatar').mockImplementation(() => new Promise((resolve) => { pending.push({ resolve }); }));
    const store = useResumeStore();
    const wrapper = render(BasicInfoEditor);
    const upload = wrapper.findComponent({ name: 'TestUpload' });
    const file = { raw: new File(['avatar'], 'avatar.png', { type: 'image/png' }) };
    upload.props('onChange')(file);
    await nextTick();
    expect(pending).toHaveLength(1);
    if (scenario === 'resume switch') store.data = { ...store.data, id: 'another-resume' };
    else if (scenario === 'unmount') wrapper.unmount();
    else {
      upload.props('onChange')(file);
      pending[1]!.resolve('new-avatar');
      await nextTick();
    }
    const patch = vi.spyOn(store, 'updateBasic');
    pending[0]!.resolve('stale-avatar');
    await nextTick();
    expect(patch).not.toHaveBeenCalled();
    expect(store.data.basic.avatar).toBe(scenario === 'newer upload' ? 'new-avatar' : undefined);
  });

  it('derives present from store and patches without changing the old project', async () => {
    const store = useResumeStore();
    const previous = store.data.projects[0]!;
    const patch = vi.spyOn(store, 'updateProject');
    const wrapper = render(ProjectEditor);
    const range = wrapper.findComponent({ name: 'MonthRangeField' });
    expect(range.props('present')).toBe(true);
    range.vm.$emit('update:present', false);
    await nextTick();
    expect(previous.endDate).toBe('present');
    expect(patch).toHaveBeenCalledExactlyOnceWith('p', { endDate: '' });
    store.data.projects[0] = { ...store.data.projects[0]!, endDate: 'present' };
    await nextTick();
    expect(wrapper.findComponent({ name: 'MonthRangeField' }).props('present')).toBe(true);
  });

  it('commits complete skill tags and leaves an unfinished word out of the saved list', async () => {
    const store = useResumeStore();
    const wrapper = render(SkillEditor);
    const tags = wrapper.findComponent({ name: 'SkillTagInput' });
    expect(tags.props('items')).toEqual(['Vue']);
    tags.vm.$emit('update:items', ['Vue', 'TypeScript']);
    await nextTick();
    expect(store.data.skills[0]!.items).toEqual(['Vue', 'TypeScript']);
    await store.undo();
    await nextTick();
    expect(wrapper.findComponent({ name: 'SkillTagInput' }).props('items')).toEqual(['Vue']);
  });

  it('patches a custom item and converts text/type together in one action', async () => {
    const store = useResumeStore();
    const list = store.data.customBlocks;
    const previous = (list[0]!.content as any[])[0];
    const patch = vi.spyOn(store, 'updateCustomItem');
    const wrapper = render(CustomBlockEditor, { id: 'b', modelValue: list[0]!.content });
    await wrapper.find('input').setValue('新标题');
    expect(patch).toHaveBeenCalledExactlyOnceWith('b', 'i', { title: '新标题' });
    expect(previous.title).toBe('旧标题');
    expect(store.data.customBlocks).toBe(list);
    store.historyPast = [];
    store.historyLastAt = 0;
    store.data.customBlocks[0] = { ...list[0]!, type: 'text', content: '<p>保留内容</p>' };
    await nextTick();
    const blockPatch = vi.spyOn(store, 'updateCustomBlock');
    await wrapper.findAll('button').find(button => button.text().includes('切换为多条目模式'))!.trigger('click');
    expect(blockPatch).toHaveBeenCalledOnce();
    expect(blockPatch.mock.lastCall![1]).toMatchObject({ type: 'list', content: [{ description: '<p>保留内容</p>' }] });
    expect(store.historyPast[0]!.customBlocks[0]).toMatchObject({ type: 'text', content: '<p>保留内容</p>' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

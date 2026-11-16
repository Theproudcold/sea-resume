import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BasicInfoEditor from '../BasicInfoEditor.vue';
import ExperienceEditor from '../ExperienceEditor.vue';
import EducationEditor from '../EducationEditor.vue';
import ProjectEditor from '../ProjectEditor.vue';
import SkillEditor from '../SkillEditor.vue';
import { useResumeStore } from '@/stores/resume';
import { checkResumeQuality } from '@/utils/resumeQuality';

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

beforeEach(() => {
  setActivePinia(createPinia());
  const store = useResumeStore();
  vi.spyOn(store, 'scheduleSave').mockImplementation(() => {});
  vi.spyOn(store, 'saveImmediately').mockImplementation(() => {});
  vi.spyOn(store, 'autoSave').mockResolvedValue();
  store.data.hiddenSections = [];
  store.data.basic = { ...store.data.basic, name: '', title: '', email: '', phone: '', summary: '' };
  store.data.experiences = [{ id: 'e', company: '', position: '', startDate: '', endDate: '', description: '' }];
  store.data.projects = [{ id: 'p', name: '', role: '', startDate: '', endDate: '', description: '' }];
  store.data.education = [{ id: 'd', school: '', degree: '', major: '', startDate: '', endDate: '' }];
  store.data.skills = [{ id: 's', category: '', items: [] }];
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('quality issue anchors', () => {
  it('every jump destination produced by the checker exists in the editors', () => {
    const store = useResumeStore();
    const anchors = new Set<string>();
    for (const editor of [BasicInfoEditor, ExperienceEditor, ProjectEditor, EducationEditor, SkillEditor]) {
      const wrapper = mount(editor, { global: { stubs } });
      wrappers.push(wrapper);
      wrapper.findAll('[data-quality-id]').forEach((node) => {
        const id = node.attributes('data-quality-id');
        if (id) anchors.add(id);
      });
    }

    const issues = checkResumeQuality(store.data);
    const missing = issues
      .map((issue) => issue.target)
      .filter((target): target is string => target !== null)
      .filter((target) => !anchors.has(target));
    expect(missing).toEqual([]);
    // Guard against a vacuous pass: the fixture must exercise every section's field anchors.
    expect(issues.filter((issue) => issue.target !== null).length).toBeGreaterThanOrEqual(13);
  });
});

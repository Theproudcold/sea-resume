import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownImportResult } from '@/types/markdown-import';
import type { ResumeData } from '@/types/resume';
import AiPdfImportDialog from '@/components/workbench/AiPdfImportDialog.vue';
import { clearAiModelSettings, clearAiSessionApiKey, saveAiModelSettings, setAiSessionApiKey } from '@/services/ai/AiSettings';

const mocks = vi.hoisted(() => ({
  extractPdfText: vi.fn(),
  requestAiPdfMarkdown: vi.fn(),
  parseResumeMarkdown: vi.fn(),
}));

vi.mock('@/services/ai/pdfResumeImport', () => ({
  extractPdfText: mocks.extractPdfText,
  requestAiPdfMarkdown: mocks.requestAiPdfMarkdown,
}));
vi.mock('@/utils/markdown/parseResumeMarkdown', () => ({ parseResumeMarkdown: mocks.parseResumeMarkdown }));

const importedResume = {
  id: 'resume-1',
  title: 'Original Resume',
  basic: { name: 'Alex Applicant', title: 'Designer', email: 'alex@example.com', phone: '1234567890', location: 'Shanghai', website: 'https://example.com', summary: '<p>Profile</p>' },
  experiences: [{ id: 'experience-1', company: 'Original Co', position: 'Designer', startDate: '2020-01', endDate: 'present', description: '<p>Work description</p>', highlights: ['Improved workflow'] }],
  projects: [{ id: 'project-1', name: 'Portfolio', role: 'Lead', startDate: '2021-01', endDate: '2021-12', description: '<p>Project description</p>', link: 'https://project.example', techStack: ['Vue'] }],
  education: [{ id: 'education-1', school: 'Example University', degree: 'Bachelor', major: 'Design', startDate: '2016-09', endDate: '2020-06', gpa: '3.8' }],
  skills: [{ id: 'skill-1', category: 'Design', items: ['Figma', 'Prototyping'] }],
  customBlocks: [],
  templateId: 'professional',
  theme: { color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5, moduleMargins: { top: 0, bottom: 24, left: 0, right: 0 }, pageMargins: 24, dateFormat: 'YYYY.MM', displayIcons: true },
  sectionOrder: ['experience', 'projects', 'education', 'skills'],
  sectionTitles: { experience: '工作经历', education: '教育背景', projects: '项目经验', skills: '技能证书' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
} as ResumeData;

const importedResult = {
  resume: importedResume,
  warnings: [{ code: 'uncertain-date', message: '请检查项目日期。' }],
  recognizedSections: ['工作经历', '项目经历', '教育背景', '技能'],
  unknownSections: [],
  sourceTitle: 'Original Resume',
} as MarkdownImportResult;

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null;
  },
});
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, type: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h(props.type === 'textarea' ? 'textarea' : 'input', {
      type: props.type === 'textarea' ? undefined : (props.type || 'text'),
      placeholder: props.placeholder,
      value: props.modelValue,
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
    });
  },
});
const ButtonStub = defineComponent({
  props: { disabled: Boolean, type: String, loading: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', { disabled: props.disabled, 'data-type': props.type, onClick: () => emit('click') }, slots.default?.());
  },
});
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('label', [
      h('input', { type: 'checkbox', checked: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked) }),
      slots.default?.(),
    ]);
  },
});
const FormItemStub = defineComponent({
  props: { label: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'form-item' }, [h('span', { class: 'form-item-label' }, props.label), slots.default?.()]);
  },
});
const AlertStub = defineComponent({
  props: { title: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-alert' }, [props.title ? h('strong', props.title) : null, slots.default?.()]);
  },
});

const stubs = {
  ElDialog: DialogStub,
  ElInput: InputStub,
  ElButton: ButtonStub,
  ElCheckbox: CheckboxStub,
  ElForm: { template: '<div><slot /></div>' },
  ElFormItem: FormItemStub,
  ElAlert: AlertStub,
  ElTag: { template: '<span><slot /></span>' },
  ElSelect: { template: '<select><slot /></select>' },
  ElOption: { template: '<option><slot /></option>' },
  ElIcon: true,
};

function createWrapper() {
  return mount(AiPdfImportDialog, { props: { modelValue: true }, global: { stubs } });
}

function getField(wrapper: ReturnType<typeof createWrapper>, label: string) {
  const field = wrapper.findAll('.form-item').find((item) => item.find('.form-item-label').text() === label);
  if (!field) throw new Error(`Missing form field: ${label}`);
  return field.find('input, textarea');
}

async function extractPdf(wrapper: ReturnType<typeof createWrapper>) {
  const fileInput = wrapper.find('input[type="file"]');
  Object.defineProperty(fileInput.element, 'files', {
    configurable: true,
    value: [new File(['local resume text'], 'candidate.pdf', { type: 'application/pdf' })],
  });
  await fileInput.trigger('change');
  await flushPromises();
}

async function parseWithConsent(wrapper: ReturnType<typeof createWrapper>) {
  await extractPdf(wrapper);
  await wrapper.find('input[type="checkbox"]').setValue(true);
  const parseButton = wrapper.findAll('button').find((button) => button.text().includes('发送文本并解析简历'));
  if (!parseButton) throw new Error('Missing parse button');
  await parseButton.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAiModelSettings();
  clearAiSessionApiKey();
  saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
  setAiSessionApiKey('test-api-key');
  mocks.extractPdfText.mockResolvedValue({ text: 'Locally extracted resume text', pageCount: 1 });
  mocks.requestAiPdfMarkdown.mockResolvedValue({ markdown: '# Resume', explanation: 'Check the extracted details.' });
  mocks.parseResumeMarkdown.mockReturnValue(importedResult);
});

describe('AiPdfImportDialog', () => {
  it('emits corrected basic and section fields in the confirm payload', async () => {
    const wrapper = createWrapper();
    await parseWithConsent(wrapper);


    expect(mocks.requestAiPdfMarkdown).toHaveBeenCalledWith({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-api-key',
      model: 'deepseek-chat',
      authMode: 'bearer', jsonMode: true, timeoutMs: 90000,
    }, 'candidate.pdf', 'Locally extracted resume text');
    expect(wrapper.text()).toContain('请检查项目日期。');
    await getField(wrapper, '姓名').setValue('Corrected Name');
    await getField(wrapper, '公司').setValue('Corrected Company');
    await getField(wrapper, '项目名称').setValue('Corrected Portfolio');
    await getField(wrapper, '学校').setValue('Corrected University');
    await getField(wrapper, '技能项（逗号分隔）').setValue('Figma, UX research');
    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认并创建新简历'));
    await confirmButton?.trigger('click');

    const payload = wrapper.emitted('confirm')?.[0]?.[0] as { resume: ResumeData; title: string; templateId: string };
    expect(payload.resume.basic.name).toBe('Corrected Name');
    expect(payload.resume.experiences[0]?.company).toBe('Corrected Company');
    expect(payload.resume.projects[0]?.name).toBe('Corrected Portfolio');
    expect(payload.resume.education[0]?.school).toBe('Corrected University');
    expect(payload.resume.skills[0]?.items).toEqual(['Figma', 'UX research']);
    expect(importedResume.basic.name).toBe('Alex Applicant');
  });

  it('emits the create-new-resume confirmation event with selected options', async () => {
    const wrapper = createWrapper();
    await parseWithConsent(wrapper);
    await getField(wrapper, '新简历名称').setValue('My New Resume');
    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认并创建新简历'));
    await confirmButton?.trigger('click');

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      title: 'My New Resume',
      templateId: 'professional',
      resume: { id: 'resume-1' },
    });
  });

  it('does not call the AI service without explicit consent', async () => {
    const wrapper = createWrapper();
    await extractPdf(wrapper);
    const parseButton = wrapper.findAll('button').find((button) => button.text().includes('发送文本并解析简历'));

    expect(parseButton?.attributes('disabled')).toBeDefined();
    await parseButton?.trigger('click');
    expect(mocks.requestAiPdfMarkdown).not.toHaveBeenCalled();
  });

  it('shows a visible error when markdown parsing fails', async () => {
    mocks.parseResumeMarkdown.mockImplementation(() => { throw new Error('简历 Markdown 解析失败'); });
    const wrapper = createWrapper();
    await parseWithConsent(wrapper);

    expect(wrapper.text()).toContain('简历 Markdown 解析失败');
    expect(wrapper.text()).not.toContain('确认并创建新简历');
  });
  it('parses with a local keyless provider and preserves its options', async () => {
    clearAiSessionApiKey();
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none', jsonMode: false, timeoutMs: 180000 });
    const wrapper = createWrapper(); await parseWithConsent(wrapper);
    expect(mocks.requestAiPdfMarkdown).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'http://localhost:11434/v1', apiKey: '', authMode: 'none', jsonMode: false, timeoutMs: 180000 }), 'candidate.pdf', 'Locally extracted resume text');
  });
});

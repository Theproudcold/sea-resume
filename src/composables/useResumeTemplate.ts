import { computed } from 'vue';
import { useResumeStore } from '@/stores/resume';
import type { ResumeData } from '@/types/resume';

interface UseResumeTemplateOptions {
  /** 固定渲染在侧栏的内置模块 ID，主栏拖拽排序时会保留它们与隐藏模块的相对位置。 */
  sidebarSectionIds?: readonly string[];
  /** 模板默认日期格式。 */
  defaultDateFormat?: string;
}

const STANDARD_SECTIONS = new Set(['education', 'experience', 'projects', 'skills']);

const DEFAULT_SECTION_TITLES: Record<string, string> = {
  education: '教育背景',
  experience: '工作经历',
  projects: '项目经验',
  skills: '专业技能',
};

const DEFAULT_SECTION_EN_TITLES: Record<string, string> = {
  education: 'EDUCATION',
  experience: 'EXPERIENCE',
  projects: 'PROJECTS',
  skills: 'SKILLS',
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 简历内置模板共用的数据投影、日期格式化、自定义模块查询与安全排序逻辑。 */
export function useResumeTemplate(
  props: { data: ResumeData },
  options: UseResumeTemplateOptions = {},
) {
  const resumeStore = useResumeStore();
  const sidebarSet = new Set(options.sidebarSectionIds ?? []);

  const visibleEducation = computed(() => props.data.education.filter((item) => item.visible !== false));
  const visibleExperiences = computed(() => props.data.experiences.filter((item) => item.visible !== false));
  const visibleProjects = computed(() => props.data.projects.filter((item) => item.visible !== false));
  const visibleSkills = computed(() => props.data.skills.filter((item) => item.visible !== false));
  const visibleCustomContacts = computed(
    () => props.data.basic.customContacts?.filter((item) => item.label || item.value) ?? [],
  );

  const isCustomBlock = (id: string) =>
    !STANDARD_SECTIONS.has(id) && props.data.customBlocks.some((block) => block.id === id);

  const getCustomContent = (id: string) =>
    props.data.customBlocks.find((block) => block.id === id)?.content ?? '';

  const getCustomItems = (id: string) => {
    const content = getCustomContent(id);
    return Array.isArray(content) ? content.filter((item) => item.visible !== false) : [];
  };

  const hasSectionContent = (id: string) => {
    if (id === 'education') return visibleEducation.value.length > 0;
    if (id === 'experience') return visibleExperiences.value.length > 0;
    if (id === 'projects') return visibleProjects.value.length > 0;
    if (id === 'skills') return visibleSkills.value.length > 0;
    if (!isCustomBlock(id)) return false;
    const content = getCustomContent(id);
    return !Array.isArray(content) || content.some((item) => item.visible !== false);
  };

  const getSectionTitle = (id: string) =>
    props.data.sectionTitles?.[id]
    || props.data.customBlocks.find((block) => block.id === id)?.title
    || DEFAULT_SECTION_TITLES[id]
    || id;

  const getSectionEnTitle = (id: string) => DEFAULT_SECTION_EN_TITLES[id] || '';

  const isSectionVisible = (id: string) =>
    !props.data.hiddenSections?.includes(id) && hasSectionContent(id);

  /** 单栏或双栏主列的可拖拽排序列表；写回时保留隐藏模块与侧栏模块，绝不丢失 ID。 */
  const sortedSections = computed({
    get: () => {
      const hidden = new Set(props.data.hiddenSections ?? []);
      return (props.data.sectionOrder ?? []).filter((id) => !hidden.has(id) && !sidebarSet.has(id));
    },
    set: (nextVisibleOrder: string[]) => {
      const order = props.data.sectionOrder ?? [];
      const hidden = new Set(props.data.hiddenSections ?? []);
      const visibleMainSet = new Set(order.filter((id) => !hidden.has(id) && !sidebarSet.has(id)));
      const remaining = [...nextVisibleOrder];
      const merged = order.map((id) => (visibleMainSet.has(id) ? (remaining.shift() ?? id) : id));
      for (const extra of remaining) {
        if (!merged.includes(extra)) merged.push(extra);
      }
      resumeStore.updateSectionOrder(merged);
    },
  });

  const sortedSidebarSections = computed(() => {
    const hidden = new Set(props.data.hiddenSections ?? []);
    return (props.data.sectionOrder ?? []).filter((id) => !hidden.has(id) && sidebarSet.has(id));
  });

  const formatDate = (value: string) => {
    if (!value) return '';
    const match = value.match(/^(\d{4})[-/.](\d{1,2})/);
    if (!match) return value;
    const year = match[1];
    const monthRaw = match[2];
    if (!year || !monthRaw) return value;
    const monthNum = Number(monthRaw);
    const month = monthRaw.padStart(2, '0');
    const abbr = MONTH_ABBR[monthNum - 1] ?? month;
    switch (props.data.theme?.dateFormat || options.defaultDateFormat || 'YYYY.MM') {
      case 'YYYY-MM': return `${year}-${month}`;
      case 'YYYY/MM': return `${year}/${month}`;
      case 'MM/YYYY': return `${month}/${year}`;
      case 'MMM YYYY': return `${abbr} ${year}`;
      case 'YYYY.MM':
      default:
        return `${year}.${month}`;
    }
  };

  const formatDateRange = (start: string, end: string | 'present', separator = ' - ') => {
    const startText = formatDate(start);
    const endText = end === 'present' ? '至今' : formatDate(end);
    return [startText, endText].filter(Boolean).join(separator);
  };

  const setActiveSection = (id: string) => resumeStore.setActiveSection(id);

  return {
    visibleEducation,
    visibleExperiences,
    visibleProjects,
    visibleSkills,
    visibleCustomContacts,
    sortedSections,
    sortedSidebarSections,
    isCustomBlock,
    getCustomContent,
    getCustomItems,
    hasSectionContent,
    isSectionVisible,
    getSectionTitle,
    getSectionEnTitle,
    formatDateRange,
    setActiveSection,
  };
}

// 基础信息
export interface BasicInfo {
  name: string;
  title: string;          // 求职意向
  email: string;
  phone: string;
  location?: string;
  website?: string;
  avatar?: string;
  birthDate?: string;       // 可选的本地生日，仅在用户开启年龄显示时使用
  showAge?: boolean;
  showExperienceYears?: boolean;
  summary?: string;       // 个人简介
  iconOverrides?: {       // 图标自定义
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
  };
}

// 工作经历
export interface Experience {
  id: string;
  company: string;
  position: string;
  startDate: string;      // YYYY-MM
  endDate: string | 'present';
  description: string;
  highlights?: string[];  // 亮点成就
}

// 教育背景
export interface Education {
  id: string;
  school: string;
  degree: string;         // 学历
  major: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

// 技能
export interface Skill {
  id: string;
  category: string;       // 分类（如：编程语言、框架）
  items: string[];        // 具体技能列表
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

// 项目经验
export interface Project {
  id: string;
  name: string;            // 项目名称
  role: string;            // 项目角色
  startDate: string;       // YYYY-MM
  endDate: string | 'present';
  description: string;
  link?: string;           // 项目链接
  techStack?: string[];    // 技术栈
}

// 自定义模块
export interface CustomBlock {
  id: string;
  title: string;
  type: 'text' | 'list'; 
  content: string | CustomItem[];
  order: number;
}

export interface CustomItem {
  id: string;
  title: string;       // 主标题 (如: 奖项名称)
  subtitle?: string;   // 副标题 (如: 颁奖机构)
  date?: string;       // 时间
  description: string; // 描述
}

// 简历元数据（轻量索引）
export interface ResumeMeta {
  id: string;
  title: string;           // 简历名称
  templateId: string;
  createdAt: number;       // 时间戳
  updatedAt: number;       // 时间戳
  thumbnail?: string;      // 缩略图 Base64（可选）
  isSynced?: boolean;      // 同步状态标记
}

// 主题配置
export interface ThemeConfig {
  color: string;
  fontFamily: string;
  fontSize: number; // px
  lineHeight: number;
  // spacing: number; // Deprecated -> use moduleMargins
  moduleMargins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  pageMargins: number; // px
  dateFormat: string; // 'YYYY.MM' | 'YYYY-MM' etc
  displayIcons: boolean; // 是否显示图标
}

// 完整简历数据
export interface ResumeData {
  id: string;
  title: string;           // 简历名称
  basic: BasicInfo;
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  customBlocks: CustomBlock[];
  templateId: string;
  jobTarget?: {
    versionName: string;
    company: string;
    position: string;
    sourceResumeId: string;
  };
  theme: ThemeConfig;
  sectionOrder: string[];
  hiddenSections?: string[];
  sectionTitles: {         // 自定义模块标题
    experience: string;
    education: string;
    projects: string;
    skills: string;
    [key: string]: string; // 支持自定义模块ID
  };
  createdAt: string;
  updatedAt: string;
}

// 模板元数据
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  category: 'modern' | 'professional' | 'creative' | 'minimal' | 'tech';
  categoryLabel: string;
  keywords: string[];
  recommendedOrder: number;
}

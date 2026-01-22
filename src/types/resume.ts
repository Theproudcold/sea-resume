// 基础信息
export interface BasicInfo {
  name: string;
  title: string;          // 求职意向
  email: string;
  phone: string;
  location?: string;
  website?: string;
  avatar?: string;
  summary?: string;       // 个人简介
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
  type: 'text' | 'list' | 'timeline';
  content: any;
  order: number;
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

// 完整简历数据
export interface ResumeData {
  id: string;
  title: string;           // 简历名称（新增）
  basic: BasicInfo;
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];     // 项目经验（新增）
  customBlocks: CustomBlock[];
  templateId: string;
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
}

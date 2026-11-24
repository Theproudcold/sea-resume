import type { ResumeData } from '@/types/resume';

/** 用户从当前简历保存的模板。快照包含内容、版式和主题，只保存在当前浏览器。 */
export interface ResumeSnapshot {
  id: string;
  name: string;
  description: string;
  /** 渲染用的内置版式组件 id。 */
  baseTemplateId: string;
  createdAt: number;
  updatedAt: number;
  snapshot: ResumeData;
}

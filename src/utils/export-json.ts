import type { ResumeData } from '@/types/resume';

/**
 * 导出简历数据为 JSON 文件
 * @param data 简历数据
 * @param filename 文件名（不含扩展名）
 */
export function exportToJSON(data: ResumeData, filename: string = 'resume-data'): void {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('JSON 导出失败:', error);
    throw error;
  }
}

/**
 * 从 JSON 文件导入简历数据
 * @returns Promise<ResumeData>
 */
export function importFromJSON(): Promise<ResumeData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonStr = event.target?.result as string;
          const data = JSON.parse(jsonStr) as ResumeData;
          resolve(data);
        } catch (error) {
          reject(new Error('JSON 解析失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    };

    input.click();
  });
}

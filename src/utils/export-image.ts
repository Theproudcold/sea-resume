import html2canvas from 'html2canvas';

/**
 * 导出简历为图片
 * @param elementId 要导出的元素ID（默认为 resume-canvas）
 * @param filename 文件名（不含扩展名）
 * @param format 图片格式（png 或 jpeg）
 */
export async function exportToImage(
  elementId: string = 'resume-canvas',
  filename: string = 'resume',
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`未找到元素: ${elementId}`);
    }

    // 渲染为 Canvas（高清）
    const canvas = await html2canvas(element, {
      scale: 2, // 2倍分辨率
      useCORS: true,
      logging: false,
      backgroundColor: format === 'jpeg' ? '#ffffff' : null,
    });

    // 转换为 Blob 并下载
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          throw new Error('图片生成失败');
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      `image/${format}`,
      format === 'jpeg' ? 0.95 : 1.0
    );
  } catch (error) {
    console.error('图片导出失败:', error);
    throw error;
  }
}

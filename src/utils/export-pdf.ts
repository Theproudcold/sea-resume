import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 导出简历为 PDF
 * @param elementId 要导出的元素ID（默认为 resume-canvas）
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  elementId: string = 'resume-canvas',
  filename: string = 'resume'
): Promise<void> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`未找到元素: ${elementId}`);
    }

    // 渲染为 Canvas（高清）
    const canvas = await html2canvas(element, {
      scale: 2, // 2倍分辨率，提高清晰度
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // A4 尺寸 (210mm x 297mm)
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = 210;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // 如果内容超过一页，可能需要分页（简化版本先不处理）
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('PDF 导出失败:', error);
    throw error;
  }
}

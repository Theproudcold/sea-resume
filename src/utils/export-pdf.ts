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

// A4 dimensions in mm
      const A4_WIDTH = 210;
      const A4_HEIGHT = 297; 

      // Render to Canvas (High Res)
      const canvas = await html2canvas(element, {
        scale: 2, // 2x resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const contentWidth = canvas.width;
      const contentHeight = canvas.height;

      // 1 mm = ? px (on specific canvas scale)
      const pageHeightInPx = (A4_HEIGHT * contentWidth) / A4_WIDTH;
      
      let position = 0; // Current vertical position on original canvas (px)
      let leftHeight = contentHeight; // Remaining height to print (px)

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = A4_WIDTH;
      const imgHeight = (A4_WIDTH / contentWidth) * contentHeight;

      // First page
      if (leftHeight < pageHeightInPx) {
        // Single page
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-page
        while (leftHeight > 0) {
          pdf.addImage(
            canvas.toDataURL('image/png'), 
            'PNG', 
            0, 
            position * (A4_WIDTH / contentWidth), // y offset in PDF (negative means shifting up)
            imgWidth, 
            imgHeight
          );
          
          leftHeight -= pageHeightInPx;
          position -= pageHeightInPx; // Move 'window' down

          if (leftHeight > 0) {
            pdf.addPage();
          }
        }
      }

      pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('PDF Export Failed:', error);
    throw error;
  }
}

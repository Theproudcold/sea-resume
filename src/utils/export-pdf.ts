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
      // Increase scale to 4 for even better quality (approx 300dpi)
      const canvas = await html2canvas(element, {
        scale: 4, 
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: (element) => element.classList.contains('no-print')
      });

      const contentWidth = canvas.width;
      const contentHeight = canvas.height;

      // Calculate A4 size in PDF points (approx 595.28 x 841.89 points) or mm
      // jsPDF('p', 'mm', 'a4') -> 210 x 297 mm
      
      const pageHeightInPx = (A4_HEIGHT * contentWidth) / A4_WIDTH;
      
      let position = 0; 
      let leftHeight = contentHeight;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = A4_WIDTH;
      const imgHeight = (A4_WIDTH / contentWidth) * contentHeight;

      // Check if content fits effectively
      if (leftHeight < pageHeightInPx) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight);
      } else {
        while (leftHeight > 0) {
          pdf.addImage(
            canvas.toDataURL('image/jpeg', 1.0), 
            'JPEG', 
            0, 
            position * (A4_WIDTH / contentWidth), // y offset
            imgWidth, 
            imgHeight
          );
          
          leftHeight -= pageHeightInPx;
          position -= pageHeightInPx;

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

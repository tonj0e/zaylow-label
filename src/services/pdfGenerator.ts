import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export class PDFGeneratorService {
  /**
   * Generates a single 100mm x 150mm (4x6 inch) thermal shipping label PDF at 300 DPI.
   */
  static async generateSinglePDF(
    element: HTMLElement,
    filename: string = 'label.pdf'
  ): Promise<void> {
    try {
      const canvas = await html2canvas(element, {
        scale: 3, // 300 DPI rendering quality for crisp barcode & text
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150], // Exact 4x6 thermal paper size
        compress: true
      });

      pdf.addImage(imgData, 'PNG', 0, 0, 100, 150, undefined, 'FAST');
      pdf.save(filename);
    } catch (err) {
      console.error('Error generating PDF:', err);
      throw err;
    }
  }

  /**
   * Generates a multi-page PDF containing selected labels for sequential 4x6 thermal printing.
   */
  static async generateBulkPDF(
    labelElements: HTMLElement[],
    filename: string = 'zaylow_bulk_labels.pdf',
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (!labelElements || labelElements.length === 0) return;

    const total = labelElements.length;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [100, 150],
      compress: true
    });

    for (let i = 0; i < total; i++) {
      if (onProgress) onProgress(i + 1, total);

      const canvas = await html2canvas(labelElements[i], {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');

      if (i > 0) {
        pdf.addPage([100, 150], 'portrait');
      }

      pdf.addImage(imgData, 'PNG', 0, 0, 100, 150, undefined, 'FAST');
    }

    pdf.save(filename);
  }
}

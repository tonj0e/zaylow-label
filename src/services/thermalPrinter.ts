import { StorageService } from './storage';

/**
 * Collects all compiled CSS text from the current document's stylesheets.
 * This is needed because the print window is a blank page and doesn't share
 * the parent's Vite-compiled Tailwind CSS. By inlining the CSS, all Tailwind
 * utility classes work correctly in the print preview.
 */
function collectPageStyles(): string {
  let css = '';
  try {
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          css += rule.cssText + '\n';
        }
      } catch {
        // Cross-origin stylesheets (e.g. Google Fonts) will throw; skip them
        // but we can still use the href to link them
        if (sheet.href) {
          css = `@import url('${sheet.href}');\n` + css;
        }
      }
    }
  } catch {
    // Fallback: silently ignore style collection errors
  }
  return css;
}

/**
 * Builds a full HTML document string for printing a thermal label.
 * Inlines all compiled page styles so Tailwind classes render correctly
 * in the isolated print window.
 *
 * IMPORTANT: The collected pageStyles may include "@media print { body * { visibility: hidden } }"
 * from the main app's index.css (which hides everything except #thermal-print-section).
 * We MUST place override rules in a SEPARATE <style> tag AFTER the injected styles
 * so they win the specificity battle and the label is visible when printing.
 */
function buildPrintHtml(labelHtmlString: string, pageStyles: string, labelWidthMm = 100, labelHeightMm = 150): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Thermal Label Print</title>
    <!-- Injected compiled styles (Tailwind utilities, etc.) -->
    <style>${pageStyles}</style>
    <!-- Override styles — placed AFTER injected styles to win specificity.
         Neutralises the main-app @media print rules that hide body content. -->
    <style>
/* ── Screen styles for the print window ── */
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
  color: #000000 !important;
  width: ${labelWidthMm}mm !important;
  height: ${labelHeightMm}mm !important;
  overflow: hidden !important;
}

/* ── Override the app's @media print hide-all rule ── */
@media print {
  /* Un-hide everything — the app's index.css sets body * { visibility: hidden }
     which would blank the print page since there is no #thermal-print-section here. */
  body *, body {
    visibility: visible !important;
  }

  /* Page size */
  @page {
    size: ${labelWidthMm}mm ${labelHeightMm}mm;
    margin: 0;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    width: ${labelWidthMm}mm !important;
    height: ${labelHeightMm}mm !important;
    overflow: hidden !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}

/* ── Thermal label element styles ── */
.thermal-label-element {
  width: ${labelWidthMm}mm !important;
  height: ${labelHeightMm}mm !important;
  box-sizing: border-box !important;
  transform: none !important;
  overflow: hidden !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  position: static !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
    </style>
  </head>
  <body>
    ${labelHtmlString}
  </body>
</html>`;
}

export class ThermalPrinterService {
  /**
   * Prints a single label using a dedicated print window for reliable output.
   * Creates a new browser window with only the label content and proper print styling.
   * Inlines the compiled Tailwind CSS so the label renders correctly in the print window.
   */
  static printLabelHTML(labelHtmlString: string, orderId?: string, labelWidthMm = 100, labelHeightMm = 150): void {
    console.log('[ThermalPrinterService] printLabelHTML received html length:', labelHtmlString.length, 'first 300 chars:', labelHtmlString.slice(0, 300));

    // Collect all compiled CSS from the current document before opening window
    const pageStyles = collectPageStyles();

    // Create a new window for printing
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('Popup blocked! Please allow popups for this site and try again.');
      return;
    }

    // Write the HTML content with all styles inlined
    printWindow.document.write(buildPrintHtml(labelHtmlString, pageStyles, labelWidthMm, labelHeightMm));
    printWindow.document.close();
    printWindow.focus();

    // Wait for any resources (fonts, images) to load, then print
    const doPrint = () => {
      printWindow.print();

      // Mark order as printed if orderId provided (after print dialog closes)
      if (orderId) {
        const handleAfterPrint = () => {
          printWindow.removeEventListener('afterprint', handleAfterPrint);
          const settings = StorageService.getSettings();
          if (settings.autoMarkPrintedOnPrint) {
            StorageService.updateOrderStatus(orderId, 'Printed');
          }
        };
        printWindow.addEventListener('afterprint', handleAfterPrint);
      }
    };

    // Use a small delay to let fonts & images render before the print dialog
    if (printWindow.document.readyState === 'complete') {
      setTimeout(doPrint, 250);
    } else {
      printWindow.onload = () => setTimeout(doPrint, 250);
    }
  }

  /**
   * Print multiple labels using a dedicated print window for reliable output.
   * Each label gets its own page in the print job.
   * Inlines the compiled Tailwind CSS so labels render correctly in the print window.
   */
  static printBulkLabelsHTML(
    labelsHtmlArray: { orderId: string; html: string }[],
    labelWidthMm = 100,
    labelHeightMm = 150
  ): void {
    if (labelsHtmlArray.length === 0) return;

    // Collect all compiled CSS from the current document before opening window
    const pageStyles = collectPageStyles();

    // Build combined labels HTML with page breaks between each
    const labelsBodyHtml = labelsHtmlArray
      .map((item, index) => {
        const pageBreak = index < labelsHtmlArray.length - 1
          ? ' style="page-break-after: always;"'
          : '';
        return `<div${pageBreak}>${item.html}</div>`;
      })
      .join('\n');

    console.log('[ThermalPrinterService] printBulkLabelsHTML combined html length:', labelsBodyHtml.length);

    // Create a new window for printing
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('Popup blocked! Please allow popups for this site and try again.');
      return;
    }

    // Write the HTML content with all styles inlined
    printWindow.document.write(buildPrintHtml(labelsBodyHtml, pageStyles, labelWidthMm, labelHeightMm));
    printWindow.document.close();
    printWindow.focus();

    // Wait for resources to load, then print
    const doPrint = () => {
      printWindow.print();

      // Mark all orders as printed (after print dialog closes)
      if (labelsHtmlArray.length > 0) {
        const handleAfterPrint = () => {
          printWindow.removeEventListener('afterprint', handleAfterPrint);
          const settings = StorageService.getSettings();
          if (settings.autoMarkPrintedOnPrint) {
            labelsHtmlArray.forEach(item => {
              StorageService.updateOrderStatus(item.orderId, 'Printed');
            });
          }
        };
        printWindow.addEventListener('afterprint', handleAfterPrint);
      }
    };

    if (printWindow.document.readyState === 'complete') {
      setTimeout(doPrint, 250);
    } else {
      printWindow.onload = () => setTimeout(doPrint, 250);
    }
  }
}
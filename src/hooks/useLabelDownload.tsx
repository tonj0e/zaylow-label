import { useCallback, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { Order, CompanySettings } from '../types';
import { ThermalLabel } from '../components/label/ThermalLabel';

/** Renders a label off-screen-in-a-modal, captures it as a PNG and downloads it. */
export function useLabelDownload(settings: CompanySettings) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [modalOrder, setModalOrder] = useState<Order | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const download = useCallback(async (order: Order) => {
    setDownloadingId(order.id);
    setModalOrder(order);
    await new Promise((r) => setTimeout(r, 300)); // let the label render with its styles
    if (labelRef.current) {
      try {
        const { captureCanvas } = await import('../utils/captureImage');
        const canvas = await captureCanvas(labelRef.current, 3);
        const link = document.createElement('a');
        link.download = `ZAYLOW-Label-${order.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        console.error('Download failed', e);
      }
    }
    setModalOrder(null);
    setDownloadingId(null);
  }, []);

  const overlay = modalOrder ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" aria-hidden="true">
      <div className="flex flex-col items-center gap-4">
        <div className="text-white text-sm font-bold animate-pulse flex items-center gap-2">
          <Download className="w-4 h-4" /> Generating label for {modalOrder.id}…
        </div>
        <div ref={labelRef} className="shadow-2xl">
          <ThermalLabel order={modalOrder} settings={settings} scale={1} />
        </div>
      </div>
    </div>
  ) : null;

  return { download, downloadingId, overlay };
}

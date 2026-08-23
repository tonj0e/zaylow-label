import React, { useState, useRef, useCallback } from 'react';
import type { Order, PrintQueueItem, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import html2canvas from 'html2canvas';
import { Printer, Trash2, History, Play, Layers, Download } from 'lucide-react';

interface PrintQueueViewProps {
  queue: PrintQueueItem[];
  allOrders: Order[];
  settings: CompanySettings;
  onClearQueue: () => void;
  onNavigateToGenerator: (order: Order) => void;
  onPrintBulkOrders?: (orders: Order[]) => void;
}

export const PrintQueueView: React.FC<PrintQueueViewProps> = ({
  queue,
  allOrders,
  settings,
  onClearQueue,
  onNavigateToGenerator,
  onPrintBulkOrders
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadModalOrder, setDownloadModalOrder] = useState<Order | null>(null);
  const downloadLabelRef = useRef<HTMLDivElement>(null);

  const handleDownloadLabel = useCallback(async (order: Order) => {
    // Show the modal overlay with the label
    setDownloadingId(order.id);
    setDownloadModalOrder(order);
    // Wait for modal + label to fully render with styles
    await new Promise(r => setTimeout(r, 300));
    if (downloadLabelRef.current) {
      try {
        const canvas = await html2canvas(downloadLabelRef.current, {
          scale: 3,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        const link = document.createElement('a');
        link.download = `ZAYLOW-Label-${order.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        console.error('Download failed', e);
      }
    }
    setDownloadModalOrder(null);
    setDownloadingId(null);
  }, []);

  // Filter history: orders with status 'Printed' or 'Shipped'
  const historyOrders = allOrders.filter(o => o.status === 'Printed' || o.status === 'Shipped');

  const handleStartSequentialPrint = () => {
    if (queue.length === 0) return;
    if (onPrintBulkOrders) {
      onPrintBulkOrders(queue.map(item => item.order));
    }
  };

  return (
    <div className="p-6 space-y-6 select-none max-w-6xl mx-auto">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Printer className="w-6 h-6 text-emerald-400" />
            <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Print Queue & History</h2>
          </div>
          <p className="text-xs text-black dark:text-white">
            Sequential bulk thermal printer job queue and historic reprint log.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-xl">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'queue'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            Active Queue ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            Print History ({historyOrders.length})
          </button>
        </div>
      </div>

      {/* QUEUE TAB CONTENT */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-black dark:text-white text-base">Sequential Bulk Thermal Printing</h3>
              <p className="text-xs text-black dark:text-white mt-0.5">
                Automatically prints <strong className="text-emerald-400">{queue.length} labels</strong> sequentially (Label 1 → Label 2 → Label N) on Helett 4×6 printer.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClearQueue}
                disabled={queue.length === 0}
                className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-black dark:text-white text-xs font-bold border border-slate-200 dark:border-slate-800 hover:text-red-400 hover:border-red-500/30 disabled:opacity-30 transition flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Queue</span>
              </button>

              <button
                onClick={handleStartSequentialPrint}
                disabled={queue.length === 0}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 disabled:opacity-40 transition flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Sequential Print</span>
              </button>
            </div>
          </div>

          {/* Progress Indicator removed because App.tsx handles global bulk print overlay */}
          {/* Queue List */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {queue.length === 0 ? (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <Layers className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="font-bold text-black dark:text-white">Print Queue is Empty</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Select orders from the Orders view and click "Add to Queue" or "Print Selected".
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-black dark:text-white">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3.5">#</th>
                      <th className="p-3.5">Order ID</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Courier</th>
                      <th className="p-3.5">Payment</th>
                      <th className="p-3.5">Added At</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {queue.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-100 dark:bg-slate-800/40 transition">
                        <td className="p-3.5 font-mono font-bold text-slate-400 dark:text-slate-500">{index + 1}</td>
                        <td className="p-3.5 font-mono font-black text-emerald-400">{item.order.id}</td>
                        <td className="p-3.5 font-bold text-black dark:text-white">{item.order.customer.name}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-black dark:text-white font-bold text-[10px]">
                            {item.order.courier}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className={`font-bold ${item.order.paymentType === 'COD' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {item.order.paymentType} {item.order.paymentType === 'COD' ? `(₹${item.order.codAmount})` : ''}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-black dark:text-white text-[11px]">
                          {new Date(item.addedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          <button
                            onClick={() => handleDownloadLabel(item.order)}
                            disabled={downloadingId === item.order.id}
                            className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 text-black dark:text-white font-bold hover:bg-slate-600 transition text-[10px] inline-flex items-center gap-1 disabled:opacity-40"
                            title="Download PNG"
                          >
                            <Download className="w-3 h-3" />
                            <span>{downloadingId === item.order.id ? '...' : 'PNG'}</span>
                          </button>
                          <button
                            onClick={() => onNavigateToGenerator(item.order)}
                            className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-emerald-400 font-bold hover:bg-emerald-500 hover:text-slate-950 transition text-[10px]"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB CONTENT */}
      {activeTab === 'history' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-black dark:text-white text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-400" />
              <span>Label Generation & Print History Log</span>
            </h3>
            <span className="text-xs text-black dark:text-white font-mono">{historyOrders.length} Saved Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-black dark:text-white">
              <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Order ID</th>
                  <th className="p-3.5">Customer & City</th>
                  <th className="p-3.5">Printed Timestamp</th>
                  <th className="p-3.5">Courier</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5 text-right">Reprint Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {historyOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-100 dark:bg-slate-800/40 transition">
                    <td className="p-3.5 font-mono font-black text-emerald-400">{order.id}</td>
                    <td className="p-3.5">
                      <span className="font-bold text-black dark:text-white block">{order.customer.name}</span>
                      <span className="text-[11px] text-black dark:text-white">{order.customer.city}, {order.customer.pinCode}</span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-black dark:text-white">
                      {order.printedAt ? new Date(order.printedAt).toLocaleString() : 'Recently'}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-black dark:text-white font-bold text-[10px]">
                        {order.courier}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-emerald-400">{order.paymentType}</td>
                    <td className="p-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => handleDownloadLabel(order)}
                        disabled={downloadingId === order.id}
                        className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 text-black dark:text-white font-bold hover:bg-slate-600 transition text-[10px] inline-flex items-center gap-1 disabled:opacity-40"
                        title="Download PNG"
                      >
                        <Download className="w-3 h-3" />
                        <span>{downloadingId === order.id ? '...' : 'PNG'}</span>
                      </button>
                      <button
                        onClick={() => onNavigateToGenerator(order)}
                        className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition text-[10px]"
                      >
                        Reprint
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Download Modal Overlay — renders label with full CSS then captures it */}
      {downloadModalOrder && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="text-black dark:text-white text-sm font-bold animate-pulse flex items-center gap-2">
              <Download className="w-4 h-4" />
              Generating label for {downloadModalOrder.id}...
            </div>
            <div ref={downloadLabelRef} className="shadow-2xl">
              <ThermalLabel
                order={downloadModalOrder}
                settings={settings}
                scale={1}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

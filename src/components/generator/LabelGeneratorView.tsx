import React, { useRef, useState, useEffect } from 'react';
import type { Order, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import { PDFGeneratorService } from '../../services/pdfGenerator';
import { ThermalPrinterService } from '../../services/thermalPrinter';
import { LABEL_SIZES, DEFAULT_LABEL_SIZE } from '../../constants/labelSizes';
import type { LabelSize } from '../../constants/labelSizes';
import {
  Printer,
  FileDown,
  Copy,
  PlusCircle,
  Sliders,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Tag,
  Layers
} from 'lucide-react';

interface LabelGeneratorViewProps {
  selectedOrder: Order | null;
  allOrders: Order[];
  settings: CompanySettings;
  onSelectOrder: (order: Order) => void;
  onAddToQueue: (orders: Order[]) => void;
  onDuplicateOrder: (order: Order) => void;
}

export const LabelGeneratorView: React.FC<LabelGeneratorViewProps> = ({
  selectedOrder,
  allOrders,
  settings,
  onSelectOrder,
  onAddToQueue,
  onDuplicateOrder
}) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [selectedSize, setSelectedSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [copyCount, setCopyCount] = useState<number>(1);

  // Auto-scale down on mobile for a perfect preview fit
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setZoomScale(0.75);
    }
  }, []);

  const activeOrder = selectedOrder || allOrders[0];

  if (!activeOrder) {
    return (
      <div className="p-12 text-center text-slate-400 dark:text-slate-500">
        No orders available. Please create an order or import sample data first.
      </div>
    );
  }

  const currentIndex = allOrders.findIndex(o => o.id === activeOrder.id);

  const handlePrev = () => {
    if (currentIndex > 0) {
      onSelectOrder(allOrders[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentIndex < allOrders.length - 1) {
      onSelectOrder(allOrders[currentIndex + 1]);
    }
  };

  const handlePrintSingle = async () => {
    if (!labelRef.current) return;
    try {
      const labelHtml = labelRef.current.outerHTML;
      console.log('[Print] label outerHTML length:', labelHtml.length, 'first 200 chars:', labelHtml.slice(0,200));
      // Print multiple copies
      for (let i = 0; i < copyCount; i++) {
        // Use ThermalPrinterService for actual printing
        ThermalPrinterService.printLabelHTML(labelHtml, activeOrder.id);

        // Small delay between prints to avoid overwhelming the print queue
        if (i < copyCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (err) {
      console.error('Print failed:', err);
      alert('Print failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDownloadPDF = async () => {
    if (!labelRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await PDFGeneratorService.generateSinglePDF(
        labelRef.current,
        `Label_${activeOrder.id}_${activeOrder.customer.name.replace(/\s+/g, '_')}.pdf`
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDuplicate = () => {
    onDuplicateOrder(activeOrder);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none pb-24 md:pb-6 max-w-7xl mx-auto">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/10 flex flex-shrink-0 items-center justify-center text-emerald-500 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20 shadow-sm">
            <Tag className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-black dark:text-white tracking-tight">Label Studio</h2>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Print label for order <strong className="text-emerald-600 dark:text-emerald-400 font-bold">#{activeOrder.id}</strong>
            </p>
          </div>
        </div>

        {/* Order Switcher Controls */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-xl shadow-sm self-start md:self-auto w-full md:w-auto justify-between md:justify-start">
          <button
            disabled={currentIndex <= 0}
            onClick={handlePrev}
            className="p-2 md:p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 text-black dark:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] md:text-xs font-mono font-bold text-slate-600 dark:text-slate-300 px-4 md:px-3 uppercase tracking-widest">
            {currentIndex + 1} of {allOrders.length}
          </span>
          <button
            disabled={currentIndex >= allOrders.length - 1}
            onClick={handleNext}
            className="p-2 md:p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 text-black dark:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Workspace Grid */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-6">
        
        {/* Mobile-first: Preview goes on top on mobile, on right on desktop */}
        <div className="order-1 lg:order-2 lg:col-span-8 flex flex-col items-center justify-center p-4 lg:p-8 bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 min-h-[480px] lg:min-h-[640px] overflow-hidden relative shadow-inner">
          <div className="mb-4 lg:mb-6 flex flex-col items-center gap-1 w-full max-w-sm bg-white dark:bg-slate-900 px-3 py-2 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-800/50 mx-auto">
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] md:text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                {selectedSize.widthMm}×{selectedSize.heightMm}mm ({selectedSize.name})
              </span>
            </div>
          </div>

          <div className="flex-1 w-full flex items-center justify-center overflow-x-auto overflow-y-hidden px-2 lg:px-0">
            <div 
              className="relative"
              style={{
                width: `${(selectedSize.widthMm * 3.779527) * zoomScale}px`,
                height: `${(selectedSize.heightMm * 3.779527) * zoomScale}px`
              }}
            >
              <div
                className="absolute top-0 left-0 transition-transform duration-300 shadow-2xl rounded-sm border-2 border-slate-200 dark:border-slate-800 overflow-hidden bg-white origin-top-left"
                style={{ transform: `scale(${zoomScale})` }}
              >
                <ThermalLabel
                  innerRef={labelRef as React.RefObject<HTMLDivElement>}
                  order={activeOrder}
                  settings={settings}
                  labelSize={selectedSize}
                  scale={1}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar & Order Details */}
        <div className="order-2 lg:order-1 lg:col-span-4 space-y-4">
          {/* Action Card */}
          <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Print Actions</h3>

            <button
              onClick={handlePrintSingle}
              className="w-full py-3.5 md:py-3 px-4 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 transform active:scale-95"
            >
              <Printer className="w-5 h-5 stroke-[2.5]" />
              <span>Print Label Now</span>
            </button>

            <button
              disabled={isGeneratingPdf}
              onClick={handleDownloadPDF}
              className="w-full py-3 md:py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all flex items-center justify-center gap-2 transform active:scale-95"
            >
              <FileDown className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF File'}</span>
            </button>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => onAddToQueue([activeOrder])}
                className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-black dark:text-white text-xs font-bold border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span>Add to Queue</span>
              </button>

              <button
                onClick={handleDuplicate}
                className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-black dark:text-white text-xs font-bold border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>{copiedNotification ? 'Duplicated!' : 'Duplicate'}</span>
              </button>
            </div>

            {/* Copy Count Selector */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Copies</label>
                <p className="text-[10px] text-black dark:text-white mt-0.5 font-medium">
                  Will print {copyCount} label{copyCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setCopyCount(Math.max(1, copyCount - 1))}
                  className="w-8 h-8 rounded-lg text-slate-500 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                >
                  <span className="text-lg leading-none font-bold mb-1">-</span>
                </button>
                <span className="w-6 text-center font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">{copyCount}</span>
                <button
                  onClick={() => setCopyCount(copyCount + 1)}
                  className="w-8 h-8 rounded-lg text-slate-500 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                >
                  <span className="text-lg leading-none font-bold mb-0.5">+</span>
                </button>
              </div>
            </div>
          </div>

          {/* Label Display Controls */}
          <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Preview Zoom Scale</span>
            </h3>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.3"
                max="1.5"
                step="0.05"
                value={zoomScale}
                onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none"
              />
              <span className="font-mono text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold px-2 py-1 rounded-lg min-w-[48px] text-center">
                {Math.round(zoomScale * 100)}%
              </span>
            </div>
          </div>

          {/* Label Size Selector */}
          <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Label Size</span>
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 pb-1">
              {LABEL_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => setSelectedSize(size)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                    selectedSize.id === size.id
                      ? 'bg-indigo-500/5 border-indigo-500/40 shadow-sm ring-1 ring-inset ring-indigo-500/10'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`font-bold text-xs ${selectedSize.id === size.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-black dark:text-white'}`}>
                      {size.name}
                    </span>
                    {size.popular && (
                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded shadow-sm">Popular</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight pr-4">{size.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Order Summary */}
          <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/70 shadow-inner">
            <h3 className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block text-[10px] mb-3">Order Details</h3>
            
            <div className="space-y-2.5 text-[11px] md:text-xs">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Order ID</span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">{activeOrder.id}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Recipient</span>
                <span className="font-bold text-black dark:text-white truncate max-w-[160px]">{activeOrder.customer.name}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Phone</span>
                <span className="font-mono font-medium text-black dark:text-white">{activeOrder.customer.phone}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">City / PIN</span>
                <span className="font-semibold text-black dark:text-white truncate max-w-[160px]">{activeOrder.customer.city} ({activeOrder.customer.pinCode})</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Courier</span>
                <span className="font-bold text-black dark:text-white">{activeOrder.courier}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Payment</span>
                <span className={`font-black tracking-wide ${activeOrder.paymentType === 'COD' ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                  {activeOrder.paymentType} {activeOrder.paymentType === 'COD' ? `(₹${activeOrder.codAmount})` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
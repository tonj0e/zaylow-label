import React, { useState } from 'react';
import type { Order, CompanySettings } from '../../types';
import { BulkImporterService } from '../../services/bulkImporter';
import type { ParsedSpreadsheet, ColumnMapping } from '../../services/bulkImporter';
import { UploadCloud, FileSpreadsheet, CheckCircle2, Table, Layers, Zap } from 'lucide-react';

interface BulkImportViewProps {
  settings: CompanySettings;
  onImportComplete: (importedOrders: Order[]) => void;
}

export const BulkImportView: React.FC<BulkImportViewProps> = ({
  settings,
  onImportComplete
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const parsed = await BulkImporterService.parseFile(uploadedFile);
      setParsedData(parsed);

      const autoMap = BulkImporterService.autoDetectMapping(parsed.headers);
      setMapping(autoMap);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse uploaded spreadsheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    if (mapping) {
      setMapping({ ...mapping, [field]: value });
    }
  };

  const handleGenerateLabels = () => {
    if (!parsedData || !mapping) return;

    setIsProcessing(true);
    try {
      const orders = BulkImporterService.convertRowsToOrders(
        parsedData.rows,
        mapping,
        settings.defaultCourier,
        settings.defaultPaymentType
      );

      onImportComplete(orders);
    } catch (err: any) {
      setErrorMsg('Error generating orders from mapped file: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 select-none max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <UploadCloud className="w-6 h-6 text-emerald-400" />
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Bulk Order Importer</h2>
        </div>
        <p className="text-xs text-black dark:text-white">
          Upload Excel (.xlsx) or CSV files to generate 100+ thermal shipping labels automatically in seconds.
        </p>
      </div>

      {/* Step 1: Drag & Drop Zone */}
      {!parsedData && (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 transition flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-black dark:text-white mb-1">
            Drop your .xlsx or .csv order spreadsheet here
          </h3>
          <p className="text-xs text-black dark:text-white mb-6 max-w-md">
            Supports Shopify export, WooCommerce orders, Shiprocket CSV, or custom warehouse Excel sheets.
          </p>

          <label className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 cursor-pointer transition flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span>Browse Spreadsheet File</span>
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {errorMsg && (
            <p className="text-xs font-bold text-red-400 mt-4 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
              {errorMsg}
            </p>
          )}
        </div>
      )}

      {/* Step 2: Field Mapping Stage */}
      {parsedData && mapping && (
        <div className="space-y-6">
          {/* File Summary Card */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="font-bold text-black dark:text-white text-sm">{file?.name}</h4>
                <p className="text-xs text-black dark:text-white">
                  Detected <strong className="text-emerald-400">{parsedData.totalRows} orders</strong> and {parsedData.headers.length} columns.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setParsedData(null);
                setFile(null);
                setMapping(null);
              }}
              className="text-xs font-bold text-black dark:text-white hover:text-black dark:text-white underline"
            >
              Upload Different File
            </button>
          </div>

          {/* Mapping Table Grid */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-black dark:text-white flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-400" />
                  <span>Column Field Mapping</span>
                </h3>
                <p className="text-xs text-black dark:text-white">
                  Verify how spreadsheet headers map to ZAYLOW shipping label fields
                </p>
              </div>

              <button
                onClick={handleGenerateLabels}
                disabled={isProcessing}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 transition flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Generate {parsedData.totalRows} Labels</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {[
                { label: 'Order ID *', key: 'orderId' },
                { label: 'Customer Name *', key: 'customerName' },
                { label: 'Phone Number *', key: 'phone' },
                { label: 'Address Line *', key: 'addressLine' },
                { label: 'Landmark', key: 'landmark' },
                { label: 'City *', key: 'city' },
                { label: 'District', key: 'district' },
                { label: 'State', key: 'state' },
                { label: 'PIN Code *', key: 'pinCode' },
                { label: 'Product Name', key: 'productName' },
                { label: 'SKU', key: 'sku' },
                { label: 'Quantity', key: 'quantity' },
                { label: 'Weight (kg)', key: 'weightKg' },
                { label: 'Courier Partner', key: 'courier' },
                { label: 'Payment Type', key: 'paymentType' },
                { label: 'COD Amount', key: 'codAmount' },
              ].map((item) => (
                <div key={item.key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                    {item.label}
                  </label>
                  <select
                    value={mapping[item.key as keyof ColumnMapping] || ''}
                    onChange={(e) => handleMappingChange(item.key as keyof ColumnMapping, e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Ignore / Default --</option>
                    {parsedData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* First 3 Rows Preview Table */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-black dark:text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Sample Row Preview (First 3 Orders)</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-black dark:text-white">
                <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px]">
                  <tr>
                    {parsedData.headers.map((h) => (
                      <th key={h} className="p-2 border-b border-slate-200 dark:border-slate-800">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {parsedData.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {parsedData.headers.map((h) => (
                        <td key={h} className="p-2 truncate max-w-[150px]">{String(row[h])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

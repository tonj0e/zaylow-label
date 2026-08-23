import React, { useState } from 'react';
import { PackagePlus, Save, DollarSign, Calculator, ChevronRight } from 'lucide-react';
import { DataService } from '../../services/dataService';

export const InventoryAdd = () => {
  const [formData, setFormData] = useState({
    productName: '',
    sku: '',
    totalCartons: '',
    piecesPerCarton: '',
    freightCost: '',
    otherCharges: '',
    pricePerPiece: '',
    supplierName: '',
    supplierPhone: '',
    supplierGst: '',
    supplierAddress: '',
    invoiceNo: '',
    poNo: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const totalPieces = (parseInt(formData.totalCartons) || 0) * (parseInt(formData.piecesPerCarton) || 0);
  const totalOrderValue = totalPieces * (parseFloat(formData.pricePerPiece) || 0);
  const totalLandedCost = totalOrderValue + (parseFloat(formData.freightCost) || 0) + (parseFloat(formData.otherCharges) || 0);
  const landedCostPerPiece = totalPieces > 0 ? (totalLandedCost / totalPieces).toFixed(2) : '0.00';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await DataService.addInventoryBatch({
        arrival_date: new Date().toISOString(),
        product_name: formData.productName,
        total_pieces: totalPieces,
        landed_cost_per_piece: parseFloat(landedCostPerPiece),
        pieces_per_carton: parseInt(formData.piecesPerCarton),
        price_per_piece: parseFloat(formData.pricePerPiece),
        freight_cost: parseFloat(formData.freightCost || '0'),
        other_charges: parseFloat(formData.otherCharges || '0'),
        supplier_name: formData.supplierName || null,
        supplier_phone: formData.supplierPhone || null,
        supplier_gst: formData.supplierGst || null,
        supplier_address: formData.supplierAddress || null,
        invoice_no: formData.invoiceNo || null,
        po_no: formData.poNo || null,
        sku: formData.sku || undefined,
        total_cartons: parseInt(formData.totalCartons) || undefined
      });
      if (result) {
        try {
          await DataService.createInventoryCartons(result.id, parseInt(formData.totalCartons) || 0, formData.sku || null);
          alert('Inventory Successfully Received in Supabase! Cartons created for tracking.');
        } catch (err) {
          console.error(err);
          alert('Inventory received but failed to create carton tracking records.');
        }
        // Reset form
        setFormData({
          productName: '', sku: '', totalCartons: '', piecesPerCarton: '',
          freightCost: '', otherCharges: '', pricePerPiece: '',
          supplierName: '', supplierPhone: '', supplierGst: '', supplierAddress: '',
          invoiceNo: '', poNo: ''
        });
      } else {
        alert('Failed to save to Supabase. Check console.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving inventory.');
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto select-none pb-24 sm:pb-8">
      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20 shadow-sm">
          <PackagePlus className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-black dark:text-white tracking-tight">Receive Inventory</h2>
          <p className="text-[11px] sm:text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Log new stock arrivals and calculate landed costs.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-4 sm:p-6 shadow-sm space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 lg:gap-12">
          {/* ── LEFT COLUMN (Product & Costing) ── */}
          <div className="space-y-8">
            
            {/* Product Info Section */}
            <div className="space-y-4 sm:space-y-5">
              <h3 className="text-[11px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2">Product Info</h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Product Name</label>
                <input type="text" name="productName" value={formData.productName} onChange={handleChange} required className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="e.g. Premium Copper Bottle" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">SKU / Model Number</label>
                <input type="text" name="sku" value={formData.sku} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="e.g. BOT-COP-100" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Total Cartons</label>
                  <input type="number" name="totalCartons" value={formData.totalCartons} onChange={handleChange} required min="1" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Pieces per Carton</label>
                  <input type="number" name="piecesPerCarton" value={formData.piecesPerCarton} onChange={handleChange} required min="1" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="0" />
                </div>
              </div>
            </div>

            {/* Costing Section */}
            <div className="space-y-4 sm:space-y-5">
              <h3 className="text-[11px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                <Calculator className="w-3.5 h-3.5" />
                Costing Calculation
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Base Price Per Piece (₹)</label>
                <div className="relative shadow-sm">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                  <input type="number" name="pricePerPiece" value={formData.pricePerPiece} onChange={handleChange} required step="0.01" min="0" className="w-full bg-slate-50 dark:bg-slate-950 border border-emerald-500/20 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Freight Cost (₹)</label>
                  <input type="number" name="freightCost" value={formData.freightCost} onChange={handleChange} step="0.01" min="0" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Other Charges (₹)</label>
                  <input type="number" name="otherCharges" value={formData.otherCharges} onChange={handleChange} step="0.01" min="0" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="0.00" />
                </div>
              </div>

              {/* Premium Summary Box */}
              <div className="mt-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-slate-900 border border-emerald-500/20 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                
                <div className="space-y-3 relative z-10">
                  <div className="flex justify-between items-center text-sm border-b border-emerald-500/10 pb-3">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Total Pieces</span>
                    <span className="font-bold text-black dark:text-white bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md">{totalPieces} units</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-emerald-500/10 pb-3">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Total Landed Cost</span>
                    <span className="font-bold text-black dark:text-white bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md">₹{totalLandedCost.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-end pt-3">
                    <div>
                      <span className="text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest text-[10px] sm:text-xs block mb-1">Final Landed Cost</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">per piece average</span>
                    </div>
                    <span className="font-black text-emerald-500 dark:text-emerald-400 text-2xl sm:text-3xl tracking-tighter leading-none">₹{landedCostPerPiece}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (Supplier Info) ── */}
          <div className="space-y-4 sm:space-y-5">
            <h3 className="text-[11px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2">Supplier & Document Info</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Supplier Name</label>
                <input type="text" name="supplierName" value={formData.supplierName} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="e.g. Global Imports Ltd" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Supplier Phone</label>
                <input type="text" name="supplierPhone" value={formData.supplierPhone} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="+91..." />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Supplier GST</label>
                <input type="text" name="supplierGst" value={formData.supplierGst} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="GSTIN..." />
              </div>
              
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Supplier Address</label>
                <input type="text" name="supplierAddress" value={formData.supplierAddress} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="Full address..." />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Invoice No.</label>
                <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="INV-..." />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">PO No.</label>
                <input type="text" name="poNo" value={formData.poNo} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" placeholder="PO-..." />
              </div>
            </div>
          </div>
        </div>

        {/* ── ACTION FOOTER ── */}
        <div className="pt-6 sm:pt-8 mt-6 sm:mt-8 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button type="submit" className="w-full sm:w-auto px-8 py-3.5 sm:py-3 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/25 active:scale-95 group">
            <Save className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-12 transition-transform" />
            <span className="text-sm sm:text-base tracking-tight">Save & Receive Inventory</span>
            <ChevronRight className="w-4 h-4 sm:hidden ml-1" />
          </button>
        </div>
      </form>
    </div>
  );
};
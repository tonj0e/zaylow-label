import React, { useState, useMemo, useRef, useCallback } from 'react';
import type { Order, OrderStatus, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import html2canvas from 'html2canvas';
import {
  Printer,
  FileDown,
  Trash2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download
} from 'lucide-react';
import { TrackingModal } from './TrackingModal';

interface OrdersViewProps {
  orders: Order[];
  settings: CompanySettings;
  searchQuery: string;
  statusFilter: OrderStatus | 'ALL';
  setStatusFilter: (status: OrderStatus | 'ALL') => void;
  onOpenOrderModal: () => void;
  onNavigateToGenerator: (order: Order) => void;
  onPrintBulkOrders: (orders: Order[]) => void;
  onAddToQueue: (orders: Order[]) => void;
  onDownloadBulkPDF: (orders: Order[]) => void;
  onDeleteOrder: (id: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateTracking: (id: string, trackingNumber: string, shippingLabelUrl: string | null) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  settings,
  searchQuery,
  statusFilter,
  setStatusFilter: _setStatusFilter,
  onOpenOrderModal,
  onNavigateToGenerator,
  onPrintBulkOrders: _onPrintBulkOrders,
  onAddToQueue,
  onDownloadBulkPDF,
  onDeleteOrder,
  onUpdateStatus,
  onUpdateTracking
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadModalOrder, setDownloadModalOrder] = useState<Order | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
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
  // Filtering & Pagination State
  const [courierFilter, setCourierFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Search text match
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.phone.includes(q) ||
        o.customer.pinCode.includes(q) ||
        o.courier.toLowerCase().includes(q) ||
        o.customer.city.toLowerCase().includes(q) ||
        o.item.productName.toLowerCase().includes(q);

      // Status filter match
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      // Courier filter match
      const matchCourier = courierFilter === 'ALL' || o.courier === courierFilter;
      // Payment filter match
      const matchPayment = paymentFilter === 'ALL' || o.paymentType === paymentFilter;

      return matchQuery && matchStatus && matchCourier && matchPayment;
    });
  }, [orders, searchQuery, statusFilter, courierFilter, paymentFilter]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Selection Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedOrders.map(o => o.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedOrdersList = useMemo(() => {
    return orders.filter(o => selectedIds.has(o.id));
  }, [orders, selectedIds]);

  const handlePrintSelected = () => {
    if (selectedOrdersList.length > 0) {
      onAddToQueue(selectedOrdersList);
    }
  };

  const handlePrintAllFiltered = () => {
    if (filteredOrders.length > 0) {
      onAddToQueue(filteredOrders);
    }
  };

  const handleDownloadSelectedPDF = () => {
    if (selectedOrdersList.length > 0) {
      onDownloadBulkPDF(selectedOrdersList);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none pb-24 md:pb-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Order Management</h2>
          <p className="text-xs text-black dark:text-white mt-1">
            Showing <strong className="text-emerald-400">{filteredOrders.length}</strong> of {orders.length} orders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.size > 0 ? (
            <>
              <button
                onClick={handlePrintSelected}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Add Selected to Queue ({selectedIds.size})</span>
              </button>

              <button
                onClick={handleDownloadSelectedPDF}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:bg-slate-700 transition flex items-center gap-2"
              >
                <FileDown className="w-4 h-4 text-emerald-400" />
                <span>Download PDF ({selectedIds.size})</span>
              </button>
            </>
          ) : (
            <button
              onClick={handlePrintAllFiltered}
              className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500 hover:text-slate-950 transition flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Add All to Queue ({filteredOrders.length})</span>
            </button>
          )}

          <button
            onClick={onOpenOrderModal}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Single Order</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        {/* Courier & Payment Filters */}
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-black dark:text-white font-bold uppercase tracking-wider text-[10px]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filters:</span>
          </div>

          <select
            value={courierFilter}
            onChange={(e) => {
              setCourierFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-black dark:text-white font-semibold focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Couriers</option>
            <option value="Delhivery">Delhivery</option>
            <option value="DTDC">DTDC</option>
            <option value="India Post">India Post</option>
            <option value="Shiprocket">Shiprocket</option>
            <option value="NimbusPost">NimbusPost</option>
            <option value="Bluedart">Bluedart</option>
            <option value="Ekart">Ekart</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-black dark:text-white font-semibold focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Payment Types</option>
            <option value="COD">COD Only</option>
            <option value="Prepaid">Prepaid Only</option>
          </select>

          {(courierFilter !== 'ALL' || paymentFilter !== 'ALL') && (
            <button
              onClick={() => {
                setCourierFilter('ALL');
                setPaymentFilter('ALL');
                setCurrentPage(1);
              }}
              className="text-emerald-400 underline font-semibold text-[11px] ml-auto"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Orders List (Table on Desktop, Cards on Mobile) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm overflow-hidden">
        
        {/* Mobile View: Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
          {paginatedOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              No orders match the selected search & filter criteria.
            </div>
          ) : (
            paginatedOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              return (
                <div 
                  key={order.id} 
                  className={`p-4 transition-colors ${isSelected ? 'bg-emerald-500/10' : 'active:bg-slate-50 dark:active:bg-slate-800/40'}`}
                >
                  {/* Card Header: Checkbox + ID + Status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(order.id)}
                        className="w-4.5 h-4.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm tracking-tight">{order.id}</span>
                        <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <select
                      value={order.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as OrderStatus;
                        if (newStatus === 'Shipped') {
                          setTrackingOrder(order);
                          return;
                        }
                        onUpdateStatus(order.id, newStatus);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${
                        order.status === 'Printed' ? 'text-emerald-500 border-emerald-500/30'
                        : order.status === 'Shipped' ? 'text-blue-500 border-blue-500/30'
                        : order.status === 'Delivered' ? 'text-teal-500 border-teal-500/30'
                        : order.status === 'Cancelled' ? 'text-red-500 border-red-500/30'
                        : order.status === 'Claims' ? 'text-purple-500 border-purple-500/30'
                        : order.status === 'Processing' || order.status === 'Label Generated' ? 'text-indigo-500 border-indigo-500/30'
                        : 'text-amber-500 border-amber-500/30'
                      }`}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="Label Generated">Label Generated</option>
                      <option value="Printed">Printed</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Claims">Claims</option>
                    </select>
                  </div>

                  {/* Card Body */}
                  <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Customer</span>
                      <span className="font-bold text-black dark:text-white block truncate">{order.customer.name}</span>
                      <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 block">{order.customer.phone}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</span>
                      <span className="font-bold text-black dark:text-white block truncate">{order.customer.city}</span>
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 block">{order.customer.pinCode}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 mb-3 border border-slate-100 dark:border-slate-800/60">
                    <div className="flex justify-between items-start mb-2 pb-2 border-b border-slate-200 dark:border-slate-800/60">
                      <div className="flex-1 pr-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Product</span>
                        <span className="font-bold text-black dark:text-white leading-tight block line-clamp-1">{order.item.productName}</span>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-1.5 py-0.5 bg-black dark:bg-white text-white dark:text-black font-black text-[10px] rounded">
                          x{order.item.quantity}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-[10px]">
                          {order.courier}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`font-black ${order.paymentType === 'COD' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {order.paymentType} {order.paymentType === 'COD' && `(₹${order.codAmount})`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleDownloadLabel(order)}
                      disabled={downloadingId === order.id}
                      className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold active:bg-slate-200 dark:active:bg-slate-700 transition text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{downloadingId === order.id ? '...' : 'PNG'}</span>
                    </button>
                    <button
                      onClick={() => onNavigateToGenerator(order)}
                      className="flex-1 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black active:bg-emerald-400 transition text-xs"
                    >
                      Print Label
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(order.id)}
                      className="p-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 active:bg-red-100 dark:active:bg-red-500/20 transition flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-black dark:text-white">
            <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && selectedIds.size === paginatedOrders.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-0"
                  />
                </th>
                <th className="p-3.5">Order ID</th>
                <th className="p-3.5">Customer & Contact</th>
                <th className="p-3.5">Address & PIN</th>
                <th className="p-3.5">Product & SKU</th>
                <th className="p-3.5">Courier</th>
                <th className="p-3.5">Payment</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 dark:text-slate-500">
                    No orders match the selected search & filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const isSelected = selectedIds.has(order.id);
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-100 dark:bg-slate-800/40 transition ${
                        isSelected ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(order.id)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-0"
                        />
                      </td>

                      <td className="p-3.5 font-mono font-black text-emerald-400">
                        {order.id}
                        <span className="block text-[9px] font-sans font-semibold text-slate-400 dark:text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-black dark:text-white block">{order.customer.name}</span>
                        <span className="font-mono text-[11px] text-black dark:text-white">{order.customer.phone}</span>
                      </td>

                      <td className="p-3.5 max-w-[200px]">
                        <p className="truncate text-black dark:text-white font-semibold">{order.customer.addressLine}</p>
                        <span className="font-mono font-bold text-emerald-400">
                          {order.customer.city}, {order.customer.pinCode}
                        </span>
                      </td>

                      <td className="p-3.5 max-w-[180px]">
                        <p className="truncate text-black dark:text-white font-semibold">{order.item.productName}</p>
                        <span className="font-mono text-[10px] text-black dark:text-white">
                          {order.item.sku} (x{order.item.quantity})
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-black dark:text-white border border-slate-300 dark:border-slate-700 font-bold text-[11px]">
                          {order.courier}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`font-black ${
                            order.paymentType === 'COD' ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {order.paymentType}
                        </span>
                        {order.paymentType === 'COD' && (
                          <span className="block font-mono text-[11px] text-black dark:text-white font-bold">
                            ₹{order.codAmount}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                          <select
                            value={order.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as OrderStatus;
                              if (newStatus === 'Shipped') {
                                setTrackingOrder(order);
                                return;
                              }
                              onUpdateStatus(order.id, newStatus);
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${
                              order.status === 'Printed'
                                ? 'text-emerald-400 border-emerald-500/30'
                                : order.status === 'Shipped'
                                ? 'text-blue-400 border-blue-500/30'
                                : order.status === 'Delivered'
                                ? 'text-teal-400 border-teal-500/30'
                                : order.status === 'Cancelled'
                                ? 'text-red-400 border-red-500/30'
                                : order.status === 'Claims'
                                ? 'text-purple-400 border-purple-500/30'
                                : order.status === 'Processing' || order.status === 'Label Generated'
                                ? 'text-indigo-400 border-indigo-500/30'
                                : 'text-amber-400 border-amber-500/30'
                            }`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Processing">Processing</option>
                            <option value="Label Generated">Label Generated</option>
                            <option value="Printed">Printed</option>
                            <option value="Shipped">Shipped</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="Claims">Claims</option>
                          </select>
                        </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownloadLabel(order)}
                            disabled={downloadingId === order.id}
                            className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 text-black dark:text-white font-bold hover:bg-slate-600 transition text-xs flex-shrink-0 inline-flex items-center gap-1 disabled:opacity-40"
                            title="Download Label as PNG"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{downloadingId === order.id ? '...' : 'PNG'}</span>
                          </button>

                          <button
                            onClick={() => onNavigateToGenerator(order)}
                            className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition text-xs"
                            title="Generate & Print 4x6 Label"
                          >
                            Print
                          </button>

                          <button
                            onClick={() => setDeleteConfirmId(order.id)}
                            className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-500 transition text-xs flex items-center gap-1"
                            title="Delete Order"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-black dark:text-white">
          <span>
            Page <strong className="text-black dark:text-white">{currentPage}</strong> of {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:bg-slate-800 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:bg-slate-800 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Download Modal Overlay — renders label with full CSS then captures it */}
      {downloadModalOrder && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-4">
            {/* Spinner text */}
            <div className="text-black dark:text-white text-sm font-bold animate-pulse flex items-center gap-2">
              <Download className="w-4 h-4" />
              Generating label for {downloadModalOrder.id}...
            </div>
            {/* The actual label rendered with all Tailwind CSS active */}
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

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-black dark:text-white font-bold text-lg leading-tight">Delete Order</h3>
                <p className="text-black dark:text-white text-sm">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-black dark:text-white text-sm mb-6">
              Are you sure you want to permanently delete order <span className="font-bold text-black dark:text-white">{deleteConfirmId}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-black dark:text-white font-semibold hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteOrder(deleteConfirmId); setDeleteConfirmId(null); }}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      <TrackingModal
        isOpen={!!trackingOrder}
        onClose={() => setTrackingOrder(null)}
        order={trackingOrder}
        onSubmit={(trackingNumber, shippingLabelUrl) => {
          if (trackingOrder) {
            onUpdateStatus(trackingOrder.id, 'Shipped');
            onUpdateTracking(trackingOrder.id, trackingNumber, shippingLabelUrl);
            setTrackingOrder(null);
          }
        }}
      />
    </div>
  );
};

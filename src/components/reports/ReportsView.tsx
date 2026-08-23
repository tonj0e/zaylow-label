import React, { useState, useEffect } from 'react';
import type { Order } from '../../types';
import type { Database } from '../../types/supabase';
import { DataService } from '../../services/dataService';
import {
  BarChart2,
  DollarSign,
  Package,
  AlertTriangle,
  RefreshCw,
  Loader,
  Box,
  ClipboardList,
  ChevronDown,
  XCircle
} from 'lucide-react';

const ReportsView = () => {
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [activeTab, setActiveTab] = useState('sales'); // sales, inventory, orders
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    codOrders: 0,
    prepaidOrders: 0,
    avgOrderValue: 0
  });
  const [topProducts, setTopProducts] = useState<Array<{ name: string; sales: number; count: number }>>([]);
  const [orderStatusDistribution, setOrderStatusDistribution] = useState<Array<{ status: string; count: number }>>([]);
  const [dailySales, setDailySales] = useState<Array<{ date: string; sales: number; orders: number }>>([]);
  const [inventoryStats, setInventoryStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0
  });

  // Fetch data based on date range
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch orders
      const allOrders = await DataService.getOrders();
      // Filter by date range
      const filteredOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        return orderDate >= startDate && orderDate <= endDate;
      });
      setOrders(filteredOrders);

      // Calculate stats
      const totalSales = filteredOrders.reduce((sum, order) => {
        return sum + (order.paymentType === 'COD' ? order.codAmount : 0); // Assuming prepaid amount is not stored? We'll adjust if needed
      }, 0);
      const totalOrders = filteredOrders.length;
      const codOrders = filteredOrders.filter(o => o.paymentType === 'COD').length;
      const prepaidOrders = totalOrders - codOrders;
      const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      setStats({
        totalSales,
        totalOrders,
        codOrders,
        prepaidOrders,
        avgOrderValue
      });

      // Top products by sales quantity
      const productSales: Record<string, { quantity: number; revenue: number }> = {};
      filteredOrders.forEach(order => {
        const productName = order.item.productName;
        if (!productSales[productName]) {
          productSales[productName] = { quantity: 0, revenue: 0 };
        }
        productSales[productName].quantity += order.item.quantity;
        // Revenue: For COD, it's codAmount; for prepaid, we don't have amount? We'll use codAmount for COD and 0 for prepaid? Not ideal.
        // We'll adjust: Assume we have a field for total amount? Not in the current Order type.
        // We'll skip revenue for now and use quantity for top products.
      });
      const topProductsArray = Object.entries(productSales)
        .map(([name, data]) => ({ name, sales: data.quantity, count: data.quantity })) // Using quantity as sales for now
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5);
      setTopProducts(topProductsArray);

      // Order status distribution
      const statusCounts: Record<string, number> = {};
      filteredOrders.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      });
      const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count
      }));
      setOrderStatusDistribution(statusDistribution);

      // Daily sales (for line chart)
      const dailyMap: Record<string, { sales: number; orders: number }> = {};
      filteredOrders.forEach(order => {
        const date = new Date(order.createdAt).toISOString().split('T')[0];
        if (!dailyMap[date]) {
          dailyMap[date] = { sales: 0, orders: 0 };
        }
        dailyMap[date].orders += 1;
        dailyMap[date].sales += order.paymentType === 'COD' ? order.codAmount : 0;
      });
      const dailySalesArray = Object.entries(dailyMap)
        .map(([date, data]) => ({
          date,
          sales: data.sales,
          orders: data.orders
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setDailySales(dailySalesArray);

      // Inventory stats (from stock summary)
      const stockSummary = await DataService.getStockSummary();
      let totalItems = 0;
      let lowStockItems = 0;
      let outOfStockItems = 0;
      stockSummary.forEach((item: Database['public']['Tables']['stock_summary']['Row']) => {
        totalItems += item.available;
        if (item.available > 0 && item.available <= 5) { // Assuming low stock threshold is 5
          lowStockItems++;
        }
        if (item.available === 0) {
          outOfStockItems++;
        }
      });
      setInventoryStats({
        totalItems,
        lowStockItems,
        outOfStockItems
      });

    } catch (error) {
      console.error('Error fetching reports data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Initial fetch and re-fetch on date range change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateRange(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader className="h-8 w-8 text-emerald-400 mb-4" />
          <p className="text-slate-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 md:pb-6">
      <div className="mb-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reports Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">View and analyze your warehouse performance</p>
      </div>

      {/* Date Range Picker */}
      <div className="bg-white rounded-xl shadow-md p-5 md:p-6 mb-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end w-full">
          <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Start Date</label>
            <input
              type="date"
              name="start"
              value={dateRange.start}
              onChange={handleDateChange}
              className="w-full px-4 py-2.5 md:py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">End Date</label>
            <input
              type="date"
              name="end"
              value={dateRange.end}
              onChange={handleDateChange}
              className="w-full px-4 py-2.5 md:py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <button
            onClick={fetchData}
            className="w-full md:w-auto px-6 py-3 md:py-2.5 mt-1 md:mt-0 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh Report</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 max-w-7xl mx-auto">
        {/* Total Sales */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-600 space-y-1">
              <p className="text-sm font-medium">Total Sales</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Period: {dateRange.start} to {dateRange.end}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-full">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">₹{stats.totalSales.toLocaleString()}</p>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-600 space-y-1">
              <p className="text-sm font-medium">Total Orders</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">All payment types</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-full">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats.totalOrders}</p>
        </div>

        {/* COD Orders */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-600 space-y-1">
              <p className="text-sm font-medium">COD Orders</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Cash on Delivery</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-full">
              <DollarSign className="h-5 w-5 text-amber-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats.codOrders}</p>
        </div>

        {/* Prepaid Orders */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-600 space-y-1">
              <p className="text-sm font-medium">Prepaid Orders</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Online payments</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-full">
              <DollarSign className="h-5 w-5 text-purple-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats.prepaidOrders}</p>
        </div>
      </div>

      {/* Tabs for different reports */}
      <div className="space-y-6 max-w-7xl mx-auto">
        <button
          onClick={() => setActiveTab('sales')}
          className={`w-full px-6 py-3 bg-white rounded-lg shadow-md flex items-center justify-between text-left ${
            activeTab === 'sales'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-slate-700 hover:bg-slate-50 transition-colors'
          }`}
        >
          <div className="flex items-center gap-3">
            <BarChart2 className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="font-medium text-slate-900">Sales Trends</h2>
              <p className="text-sm text-slate-400 dark:text-slate-500">Daily sales and order volume</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 ${
            activeTab === 'sales' ? 'text-emerald-600' : 'text-black dark:text-white'
          }`} />
        </button>

        {/* Sales Charts Conditional */}
        {activeTab === 'sales' && (
          <div className="mt-4 space-y-6">
            {/* Daily Sales Line Chart (simplified with bars) */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4">Daily Sales Trend</h2>
              <div className="space-y-4">
                {dailySales.map((day) => (
                  <div key={day.date} className="flex items-center">
                    <div className="w-20 text-right text-xs text-slate-400 dark:text-slate-500">
                      {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="flex-1 bg-slate-200 rounded-full h-2.5">
                      <div
                        className={`h-full bg-emerald-600 rounded-full transition-all duration-500`}
                        style={{ width: `${(day.sales / Math.max(...dailySales.map((d) => d.sales)) * 100 || 0)}%` }}
                      ></div>
                    </div>
                    <div className="w-20 text-left text-xs text-slate-400 dark:text-slate-500 ml-2">
                      ₹{day.sales.toLocaleString()} ({day.orders} orders)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Status Distribution (Pie chart simplified) */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4">Order Status Distribution</h2>
              <div className="grid grid-cols-1 gap-4">
                {orderStatusDistribution.map((status) => (
                  <div key={status.status} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[hsl(var(--hue),70%,90%)]">
                      {/* We'll use a simple color mapping */}
                      <span className="text-[hsl(var(--hue),70%,40%)] font-bold">
                        {status.status.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{status.status}</p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">{status.count} orders</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-10 bg-slate-200 rounded-full h-2.5">
                        <div
                          className={`h-full bg-emerald-600 rounded-full`}
                          style={{ width: `${(status.count / Math.max(...orderStatusDistribution.map((s) => s.count)) * 100 || 0)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{Math.round((status.count / Math.max(...orderStatusDistribution.map((s) => s.count)) * 100 || 0))}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Inventory Reports Tab */}
        <button
          onClick={() => setActiveTab('inventory')}
          className={`w-full px-6 py-3 bg-white rounded-lg shadow-md flex items-center justify-between text-left ${
            activeTab === 'inventory'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-slate-700 hover:bg-slate-50 transition-colors'
          }`}
        >
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="font-medium text-slate-900">Inventory Report</h2>
              <p className="text-sm text-slate-400 dark:text-slate-500">Stock levels and product performance</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 ${
            activeTab === 'inventory' ? 'text-emerald-600' : 'text-black dark:text-white'
          }`} />
        </button>

        <div className="mt-4 space-y-6">
          {/* Inventory Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-slate-600 space-y-1">
                  <p className="text-sm font-medium">Total Items in Stock</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Available units</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-full">
                  <Box className="h-5 w-5 text-indigo-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900">{inventoryStats.totalItems}</p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-slate-600 space-y-1">
                  <p className="text-sm font-medium">Low Stock Items</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">&lt;= 5 units</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-full">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900">{inventoryStats.lowStockItems}</p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-slate-600 space-y-1">
                  <p className="text-sm font-medium">Out of Stock</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">0 units available</p>
                </div>
                <div className="p-3 bg-red-50 rounded-full">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900">{inventoryStats.outOfStockItems}</p>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
            <div className="overflow-x-auto">
              {/* Mobile View (Cards) */}
              <div className="md:hidden space-y-3">
                {topProducts.length > 0 ? (
                  topProducts.map((product, idx) => (
                    <div key={product.name + idx} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                          {idx + 1}
                        </div>
                        <p className="font-bold text-slate-900 text-sm">{product.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-emerald-600">{product.sales}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Units Sold</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl">
                    No data available
                  </div>
                )}
              </div>

              {/* Desktop View (Table) */}
              <table className="hidden md:table w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Units Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {topProducts.length > 0 ? (
                    topProducts.map((product) => (
                      <tr key={product.name} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                        <td className="px-4 py-3 text-slate-600">{product.sales}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-center text-slate-400 dark:text-slate-500">
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Orders Reports Tab */}
        <button
          onClick={() => setActiveTab('orders')}
          className={`w-full px-6 py-3 bg-white rounded-lg shadow-md flex items-center justify-between text-left ${
            activeTab === 'orders'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-slate-700 hover:bg-slate-50 transition-colors'
          }`}
        >
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="font-medium text-slate-900">Orders Report</h2>
              <p className="text-sm text-slate-400 dark:text-slate-500">Order details and fulfillment metrics</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 ${
            activeTab === 'orders' ? 'text-emerald-600' : 'text-black dark:text-white'
          }`} />
        </button>

        <div className="mt-4 space-y-6">
          {/* Recent Orders Table */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
            <div className="overflow-x-auto">
              {/* Mobile View (Cards) */}
              <div className="md:hidden space-y-3">
                {orders.slice(0, 10).map((order) => (
                  <div key={order.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{order.customer.name}</p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">{order.id}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'Shipped' ? 'bg-emerald-100 text-emerald-800'
                        : order.status === 'Pending' ? 'bg-amber-100 text-amber-800'
                        : order.status === 'Delivered' ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200 text-slate-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-3 bg-white p-3 rounded-lg border border-slate-100">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Amount</p>
                        <p className="text-sm font-black text-slate-800">{order.paymentType === 'COD' ? `₹${order.codAmount}` : 'Prepaid'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Date</p>
                        <p className="text-sm font-bold text-slate-800">{new Date(order.createdAt).toLocaleDateString('en-GB')}</p>
                      </div>
                    </div>
                    
                    <button onClick={() => alert(`View order ${order.id}`)} className="w-full py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                      View Details
                    </button>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl">
                    No recent orders
                  </div>
                )}
              </div>

              {/* Desktop View (Table) */}
              <table className="hidden md:table w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orders
                    .slice(0, 10)
                    .map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm text-slate-900">{order.id}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{order.customer.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {order.paymentType === 'COD' ? `₹${order.codAmount}` : 'Prepaid'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              order.status === 'Shipped'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.status === 'Pending'
                                ? 'bg-amber-100 text-amber-800'
                                : order.status === 'Delivered'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm space-x-2">
                          <button
                            onClick={() => {
                              // In a real app, we would navigate to order details or print label
                              alert(`View order ${order.id}`);
                            }}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

              </div>
    </div>
  );
};

export default ReportsView;
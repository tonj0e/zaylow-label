import React, { useState, useEffect } from 'react';
import type { CompanySettings, CourierName, PaymentType } from '../../types';
import { IntegrationService, type IntegrationSetting } from '../../services/integrationService';
import { Settings as SettingsIcon, Save, Building2, Printer, Link2, CheckCircle2, Loader2, XCircle, RefreshCw, Download, Truck, Store, Send, Eye, EyeOff, History } from 'lucide-react';
import { loadTelegramConfig, saveTelegramConfig, sendTelegramMessage, TelegramMessages, type TelegramConfig } from '../../services/telegramService';
import { DataService } from '../../services/dataService';

interface SettingsViewProps {
  settings: CompanySettings;
  onSaveSettings: (newSettings: CompanySettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings
}) => {
  const [activeTab, setActiveTab] = useState<'warehouse' | 'printer' | 'integrations' | 'telegram'>('warehouse');
  const [formData, setFormData] = useState<CompanySettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Telegram state
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(loadTelegramConfig);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgTestResult, setTgTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showToken, setShowToken] = useState(false);

  const handleSaveTelegram = () => {
    saveTelegramConfig(tgConfig);
    setTgTestResult({ ok: true, message: 'Telegram config saved!' });
    setTimeout(() => setTgTestResult(null), 3000);
  };

  const handleTestTelegram = async () => {
    if (!tgConfig.botToken || !tgConfig.chatId) {
      setTgTestResult({ ok: false, message: 'Please enter Bot Token and Chat ID first.' });
      return;
    }
    setTgTesting(true);
    setTgTestResult(null);
    saveTelegramConfig(tgConfig);
    const result = await sendTelegramMessage(tgConfig.botToken, tgConfig.chatId, TelegramMessages.testMessage());
    setTgTesting(false);
    setTgTestResult(
      result.ok
        ? { ok: true, message: 'Test message sent! Check your Telegram.' }
        : { ok: false, message: result.error || 'Failed to send. Check your Bot Token and Chat ID.' }
    );
  };

  // Bulk-send state
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSendPastDelivered = async () => {
    if (!tgConfig.botToken || !tgConfig.chatId) {
      setBulkResult({ ok: false, message: 'Please save your Telegram config first.' });
      return;
    }
    setBulkSending(true);
    setBulkProgress(null);
    setBulkResult(null);
    try {
      const allOrders = await DataService.getOrders();
      const delivered = allOrders.filter(o => o.status === 'Delivered');
      if (delivered.length === 0) {
        setBulkResult({ ok: true, message: 'No delivered orders found.' });
        setBulkSending(false);
        return;
      }
      // Send header summary first
      await sendTelegramMessage(tgConfig.botToken, tgConfig.chatId,
        TelegramMessages.bulkSummaryHeader(delivered.length));
      // Send each order with a small delay to avoid Telegram rate limits
      for (let i = 0; i < delivered.length; i++) {
        setBulkProgress({ done: i, total: delivered.length });
        await sendTelegramMessage(tgConfig.botToken, tgConfig.chatId,
          TelegramMessages.orderDelivered(delivered[i]));
        if (i < delivered.length - 1) {
          await new Promise(r => setTimeout(r, 1200)); // 1.2s gap to avoid rate limit
        }
      }
      setBulkProgress({ done: delivered.length, total: delivered.length });
      setBulkResult({ ok: true, message: `Done! Sent ${delivered.length} delivered order(s) to Telegram.` });
    } catch (e: any) {
      setBulkResult({ ok: false, message: e.message || 'Something went wrong.' });
    } finally {
      setBulkSending(false);
    }
  };

  // Integration state
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSetting[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeTab === 'integrations') loadIntegrations();
  }, [activeTab]);

  const loadIntegrations = async () => {
    setLoadingIntegrations(true);
    const data = await IntegrationService.getAll();
    setIntegrationSettings(data);
    setLoadingIntegrations(false);
  };

  const handleSaveCredentials = async (id: string) => {
    setSavingId(id);
    await IntegrationService.saveCredentials(id, formValues);
    await loadIntegrations();
    setEditingId(null);
    setFormValues({});
    setSavingId(null);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    const result = await IntegrationService.testConnection(id);
    setTestResults(prev => ({ ...prev, [id]: result }));
    await loadIntegrations(); // Refresh active status
    setTestingId(null);
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm(`Disconnect ${id}? Your API key will be removed.`)) return;
    await IntegrationService.disconnect(id);
    setTestResults(prev => { const n = {...prev}; delete n[id]; return n; });
    await loadIntegrations();
  };

  const handleImport = async (platform: 'shopify' | 'woocommerce') => {
    setImportingId(platform);
    const result = await IntegrationService.importOrders(platform);
    if (result.error) {
      setImportResults(prev => ({ ...prev, [platform]: `Error: ${result.error}` }));
    } else {
      setImportResults(prev => ({ ...prev, [platform]: `✅ Imported ${result.imported} of ${result.total} orders` }));
    }
    setImportingId(null);
  };

  const getPlatformFields = (platform: string) => {
    switch (platform) {
      case 'Delhivery': return [{ key: 'api_key', label: 'API Token', placeholder: 'Your Delhivery API token', type: 'password' }];
      case 'Shiprocket': return [
        { key: 'email', label: 'Email Address', placeholder: 'your@email.com', type: 'email' },
        { key: 'api_key', label: 'Password', placeholder: 'Your Shiprocket password', type: 'password' },
      ];
      case 'Shopify': return [
        { key: 'store_url', label: 'Store URL', placeholder: 'your-store.myshopify.com', type: 'text' },
        { key: 'api_key', label: 'Admin API Access Token', placeholder: 'shpat_xxxx...', type: 'password' },
      ];
      case 'WooCommerce': return [
        { key: 'store_url', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'text' },
        { key: 'api_key', label: 'Consumer Key', placeholder: 'ck_xxxx...', type: 'password' },
        { key: 'api_secret', label: 'Consumer Secret', placeholder: 'cs_xxxx...', type: 'password' },
      ];
      default: return [{ key: 'api_key', label: 'API Key', placeholder: 'API Key', type: 'password' }];
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Delhivery':
      case 'Shiprocket':
        return <Truck className="w-5 h-5 text-emerald-500" />;
      case 'Shopify':
      case 'WooCommerce':
        return <Building2 className="w-5 h-5 text-emerald-500" />;
      case 'Amazon':
      case 'Flipkart':
        return <Store className="w-5 h-5 text-emerald-500" />;
      default:
        return <Link2 className="w-5 h-5 text-slate-400" />;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 select-none max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SettingsIcon className="w-6 h-6 text-emerald-400 shrink-0" />
            <h2 className="text-xl sm:text-2xl font-black text-black dark:text-white tracking-tight">System Settings & Calibration</h2>
          </div>
          <p className="text-[10px] sm:text-xs text-black dark:text-white">
            Manage company branding, warehouse address, thermal printer preferences, and platform integrations.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-1 sm:flex sm:flex-row items-stretch sm:items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-xl">
          <button
            onClick={() => setActiveTab('warehouse')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'warehouse'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            Warehouse & Branding
          </button>
          <button
            onClick={() => setActiveTab('printer')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'printer'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            Thermal Printer Config
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'integrations'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            E-commerce Integrations
          </button>
          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'telegram'
                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                : 'text-black dark:text-white hover:text-black dark:text-white'
            }`}
          >
            <Send className="w-3 h-3" />
            Telegram Alerts
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Settings saved successfully!</span>
        </div>
      )}

      {/* WAREHOUSE & BRANDING TAB */}
      {activeTab === 'warehouse' && (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-black dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Company Branding</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Tagline / Subheader
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                Logo URL (Dark/Light Monochrome Image)
              </label>
              <input
                type="text"
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-black dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Warehouse Origin & Return Address</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Warehouse Facility Name
                </label>
                <input
                  type="text"
                  value={formData.warehouse.companyName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      warehouse: { ...formData.warehouse, companyName: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Dispatch Phone Number
                </label>
                <input
                  type="text"
                  value={formData.warehouse.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      warehouse: { ...formData.warehouse, phone: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                Address Line
              </label>
              <input
                type="text"
                value={formData.warehouse.addressLine}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    warehouse: { ...formData.warehouse, addressLine: e.target.value }
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={formData.warehouse.city}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      warehouse: { ...formData.warehouse, city: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={formData.warehouse.state}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      warehouse: { ...formData.warehouse, state: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  value={formData.warehouse.pinCode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      warehouse: { ...formData.warehouse, pinCode: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-emerald-400 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Warehouse & Branding Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* THERMAL PRINTER CONFIG TAB */}
      {activeTab === 'printer' && (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-black dark:text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Helett Thermal Printer Hardware Calibration</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Paper Size Dimension
                </label>
                <select
                  value={formData.paperSize}
                  onChange={(e) => setFormData({ ...formData, paperSize: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="100x150mm">100mm × 150mm (Standard 4×6 Inches)</option>
                  <option value="100x100mm">100mm × 100mm (4×4 Inches Square)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Print Resolution (DPI)
                </label>
                <select
                  value={formData.dpi}
                  onChange={(e) => setFormData({ ...formData, dpi: parseInt(e.target.value) as any })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value={300}>300 DPI (Ultra Sharp Thermal Output)</option>
                  <option value={200}>200 DPI (Standard Thermal Speed)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Default Courier Partner
                </label>
                <select
                  value={formData.defaultCourier}
                  onChange={(e) => setFormData({ ...formData, defaultCourier: e.target.value as CourierName })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-semibold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="Delhivery">Delhivery</option>
                  <option value="DTDC">DTDC</option>
                  <option value="India Post">India Post</option>
                  <option value="Shiprocket">Shiprocket</option>
                  <option value="NimbusPost">NimbusPost</option>
                  <option value="Bluedart">Bluedart</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Default Payment Mode
                </label>
                <select
                  value={formData.defaultPaymentType}
                  onChange={(e) => setFormData({ ...formData, defaultPaymentType: e.target.value as PaymentType })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-semibold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="COD">COD</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoMarkPrintedOnPrint}
                  onChange={(e) => setFormData({ ...formData, autoMarkPrintedOnPrint: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-500 focus:ring-0"
                />
                <span className="text-xs font-semibold text-black dark:text-white">
                  Automatically mark order status as <strong className="text-emerald-400">"Printed"</strong> upon triggering print command.
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20 transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Printer Calibration</span>
            </button>
          </div>
        </form>
      )}

      {/* E-COMMERCE INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="p-3 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-black dark:text-white text-sm sm:text-base flex items-start sm:items-center gap-1.5 sm:gap-2">
                <Link2 className="w-4 h-4 text-emerald-400 mt-0.5 sm:mt-0 shrink-0" />
                <span className="leading-tight">Multi-Platform E-commerce &amp; Logistics API Integrations</span>
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-1 sm:mt-1 leading-tight sm:leading-normal">
                Connect your courier and e-commerce accounts. API keys are stored securely in Supabase.
              </p>
            </div>
            <button onClick={loadIntegrations} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <RefreshCw className={`w-4 h-4 text-slate-400 ${loadingIntegrations ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingIntegrations ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading integrations...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {integrationSettings.map((int) => {
                const isEditing = editingId === int.id;
                const isTesting = testingId === int.id;
                const isSaving = savingId === int.id;
                const isImporting = importingId === int.id;
                const testResult = testResults[int.id];
                const fields = getPlatformFields(int.platform);
                const canImport = int.platform === 'Shopify' || int.platform === 'WooCommerce';
                const canPush = int.platform === 'Delhivery' || int.platform === 'Shiprocket';

                return (
                  <div key={int.id} className="p-3 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    {/* Header */}
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1 flex-shrink-0">
                          {getPlatformIcon(int.platform)}
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-bold text-black dark:text-white text-xs sm:text-sm leading-tight">{int.name}</h4>
                          <span className="text-[9px] sm:text-[10px] font-mono text-slate-400 leading-tight">{int.platform}</span>
                        </div>
                      </div>
                      <span className={`px-1.5 sm:px-2.5 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                        int.is_active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {int.is_active ? 'Connected ✓' : 'Disconnected'}
                      </span>
                    </div>

                    {/* Status info */}
                    {int.is_active && (
                      <div className="text-[10px] text-slate-500 space-y-0.5">
                        {int.last_verified && <p>✅ Verified: {new Date(int.last_verified).toLocaleString()}</p>}
                        {int.last_sync && <p>🔄 Last Sync: {new Date(int.last_sync).toLocaleString()}</p>}
                      </div>
                    )}

                    {/* Test result banner */}
                    {testResult && (
                      <div className={`p-2 rounded-lg text-[11px] font-bold flex items-center gap-2 ${
                        testResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {testResult.success ? 'Connection successful!' : `Failed: ${testResult.error}`}
                      </div>
                    )}

                    {/* Import result */}
                    {importResults[int.id] && (
                      <div className="p-2 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {importResults[int.id]}
                      </div>
                    )}

                    {/* Credential entry form */}
                    {isEditing ? (
                      <div className="space-y-2">
                        {fields.map(field => (
                          <div key={field.key}>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{field.label}</label>
                            <input
                              type={field.type}
                              placeholder={field.placeholder}
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-black dark:text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleSaveCredentials(int.id)}
                            disabled={isSaving}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition flex items-center justify-center gap-1"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Save Keys
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setFormValues({}); }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1">
                        {!int.is_active ? (
                          <button
                            onClick={() => { setEditingId(int.id); setFormValues({}); }}
                            className="w-full sm:w-auto flex-1 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition"
                          >
                            Enter API Keys
                          </button>
                        ) : (
                          <>
                            {canImport && (
                              <button
                                onClick={() => handleImport(int.platform.toLowerCase() as any)}
                                disabled={isImporting}
                                className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30 transition"
                              >
                                {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Import Orders
                              </button>
                            )}
                            {canPush && (
                              <span className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Ready for push
                              </span>
                            )}
                            <div className="flex w-full sm:w-auto gap-1.5 sm:gap-2">
                              <button
                                onClick={() => handleTest(int.id)}
                                disabled={isTesting}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold hover:opacity-80 transition"
                              >
                                {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Re-test
                              </button>
                              <button
                                onClick={() => handleDisconnect(int.id)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition"
                              >
                                Disconnect
                              </button>
                            </div>
                          </>
                        )}
                        {int.api_key && !int.is_active && (
                          <button
                            onClick={() => handleTest(int.id)}
                            disabled={isTesting}
                            className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition"
                          >
                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* TELEGRAM NOTIFICATIONS TAB */}
      {activeTab === 'telegram' && (
        <div className="space-y-4 sm:space-y-6">

          {/* Header Card */}
          <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-sky-500/5 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-500/20 rounded-xl shrink-0">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-black text-black dark:text-white text-sm sm:text-base">Telegram Order Notifications</h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-relaxed">
                  Get instant messages on Telegram when orders are <strong>Shipped</strong> or <strong>Delivered</strong>.
                  Works 24/7, even when the app is closed.
                </p>
              </div>
            </div>
          </div>

          {/* Step-by-step setup guide */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="font-bold text-black dark:text-white text-xs uppercase tracking-wider">How to Set Up (2 minutes)</h4>
            <div className="space-y-2">
              {[
                { step: '1', text: 'Open Telegram and search for ', link: '@BotFather', href: 'https://t.me/BotFather' },
                { step: '2', text: 'Send', link: null, extra: ' /newbot — give your bot a name, copy the Token it gives you' },
                { step: '3', text: 'Open your bot chat, then go to ', link: '@userinfobot', href: 'https://t.me/userinfobot' },
                { step: '4', text: 'Send any message there — copy your Chat ID number' },
                { step: '5', text: 'Paste both below and click Test Connection' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-black flex items-center justify-center mt-0.5">{item.step}</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.text}
                    {item.link && item.href && (
                      <a href={item.href} target="_blank" rel="noreferrer" className="text-blue-400 font-bold hover:underline">{item.link}</a>
                    )}
                    {item.extra && <span>{item.extra}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Credentials form */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="font-bold text-black dark:text-white text-xs uppercase tracking-wider">Your Bot Credentials</h4>

            {/* Bot Token */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Bot Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="123456789:ABCdef..."
                  value={tgConfig.botToken}
                  onChange={e => setTgConfig(prev => ({ ...prev, botToken: e.target.value.trim() }))}
                  className="w-full px-4 py-3 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-black dark:text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">From @BotFather — looks like <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">123456789:ABCdefGhI...</code></p>
            </div>

            {/* Chat ID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Your Chat ID</label>
              <input
                type="text"
                placeholder="e.g. 123456789"
                value={tgConfig.chatId}
                onChange={e => setTgConfig(prev => ({ ...prev, chatId: e.target.value.trim() }))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-black dark:text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <p className="text-[10px] text-slate-400">From @userinfobot — a number like <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">987654321</code></p>
            </div>

            {/* Test result */}
            {tgTestResult && (
              <div className={`flex items-center gap-2 text-xs font-bold p-3 rounded-xl ${
                tgTestResult.ok
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {tgTestResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {tgTestResult.message}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleTestTelegram}
                disabled={tgTesting || !tgConfig.botToken || !tgConfig.chatId}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs transition-all shadow-lg shadow-blue-500/20"
              >
                {tgTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {tgTesting ? 'Sending...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSaveTelegram}
                disabled={!tgConfig.botToken || !tgConfig.chatId}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          </div>

          {/* What you'll receive */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h4 className="font-bold text-black dark:text-white text-xs uppercase tracking-wider mb-3">Notifications You'll Receive</h4>
            <div className="space-y-2">
              {[
                { emoji: '📦', label: 'Order Shipped', desc: 'When you add a tracking number to any order' },
                { emoji: '✅', label: 'Order Delivered', desc: 'When you mark an order as Delivered' },
                { emoji: '❌', label: 'Order Cancelled', desc: 'When you cancel an order' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950">
                  <span className="text-base leading-none mt-0.5">{item.emoji}</span>
                  <div>
                    <p className="text-xs font-bold text-black dark:text-white">{item.label}</p>
                    <p className="text-[10px] text-slate-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bulk send past delivered orders */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
                <History className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h4 className="font-bold text-black dark:text-white text-xs uppercase tracking-wider">Send Past Delivered Orders</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Send all previously delivered orders to Telegram — with full customer details, phone, pincode, product, tracking number and date.
                </p>
              </div>
            </div>

            {bulkProgress && bulkSending && (
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                />
              </div>
            )}
            {bulkProgress && bulkSending && (
              <p className="text-[11px] text-slate-500 font-bold text-center">
                Sending {bulkProgress.done} / {bulkProgress.total}...
              </p>
            )}

            {bulkResult && (
              <div className={`flex items-center gap-2 text-xs font-bold p-3 rounded-xl ${
                bulkResult.ok
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {bulkResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {bulkResult.message}
              </div>
            )}

            <button
              onClick={handleSendPastDelivered}
              disabled={bulkSending || !tgConfig.botToken || !tgConfig.chatId}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20"
            >
              {bulkSending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                : <><History className="w-3.5 h-3.5" /> Send All Delivered Orders to Telegram</>}
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

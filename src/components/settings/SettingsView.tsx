import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CompanySettings, CourierName, PaymentType } from '../../types';
import { IntegrationService, type IntegrationSetting } from '../../services/integrationService';
import {
  Building2, Check, Download, Eye, EyeOff, History, Link2, Loader2, MapPin, Printer, RefreshCw, Save, Send, Store, Truck, X,
} from 'lucide-react';
import { loadTelegramConfig, saveTelegramConfig, sendTelegramMessage, TelegramMessages, type TelegramConfig } from '../../services/telegramService';
import { DataService } from '../../services/dataService';

interface SettingsViewProps {
  settings: CompanySettings;
  onSaveSettings: (newSettings: CompanySettings) => void;
}

type Section = 'company' | 'warehouse' | 'printing' | 'integrations' | 'telegram';

const SECTIONS: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'company', label: 'Company', hint: 'Name, tagline and logo', icon: <Building2 className="w-4 h-4" /> },
  { key: 'warehouse', label: 'Sender address', hint: 'The From address on labels', icon: <MapPin className="w-4 h-4" /> },
  { key: 'printing', label: 'Labels and printing', hint: 'Paper, quality and defaults', icon: <Printer className="w-4 h-4" /> },
  { key: 'integrations', label: 'Couriers and stores', hint: 'Connect Delhivery, Shopify and more', icon: <Link2 className="w-4 h-4" /> },
  { key: 'telegram', label: 'Telegram alerts', hint: 'Order messages on your phone', icon: <Send className="w-4 h-4" /> },
];

const digits = (s: string) => s.replace(/\D/g, '');

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative w-12 h-7 rounded-full shrink-0 transition-colors" style={{ background: on ? 'var(--lime)' : 'var(--line)' }}>
    <span className="absolute top-1 left-1 w-5 h-5 rounded-full transition-transform" style={{ background: on ? 'var(--on-lime)' : 'var(--muted)', transform: on ? 'translateX(20px)' : 'none' }} />
  </button>
);

const Choice: React.FC<{ options: { value: string; label: string; note?: string }[]; value: string; onChange: (v: string) => void; label: string; cols?: string }> = ({ options, value, onChange, label, cols = 'grid-cols-2' }) => (
  <div role="radiogroup" aria-label={label} className={`grid ${cols} gap-2`}>
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} className="text-left rounded-2xl px-4 py-3 transition-colors" style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--card2)', border: '1px solid var(--line)' }}>
          <span className="block text-sm font-semibold">{o.label}</span>
          {o.note && <span className="block text-xs mt-0.5" style={{ opacity: 0.65 }}>{o.note}</span>}
        </button>
      );
    })}
  </div>
);

const Field: React.FC<{ id: string; label: string; error?: string; hint?: string; children: React.ReactNode }> = ({ id, label, error, hint, children }) => (
  <div>
    <label htmlFor={id} className="k-label">{label}</label>
    {children}
    {error ? <p role="alert" className="text-xs font-medium mt-1.5 k-bad">{error}</p> : hint ? <p className="text-xs k-muted mt-1.5">{hint}</p> : null}
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [section, setSection] = useState<Section>('company');
  const [saved, setSaved] = useState<CompanySettings>(settings);
  const [formData, setFormData] = useState<CompanySettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedNote, setSavedNote] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(() => JSON.stringify(formData) !== JSON.stringify(saved), [formData, saved]);
  const formSection = section === 'company' || section === 'warehouse' || section === 'printing';

  const setWarehouse = (patch: Partial<CompanySettings['warehouse']>) => setFormData((f) => ({ ...f, warehouse: { ...f.warehouse, ...patch } }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.companyName.trim()) e.companyName = 'Enter your company name.';
    const pin = formData.warehouse.pinCode.trim();
    if (pin && !/^\d{6}$/.test(pin)) e.pinCode = 'A PIN code has 6 digits.';
    const ph = digits(formData.warehouse.phone);
    if (formData.warehouse.phone.trim() && (ph.length < 10 || ph.length > 12)) e.phone = 'Enter a 10 digit phone number.';
    return e;
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setSection(found.companyName ? 'company' : 'warehouse');
      return;
    }
    onSaveSettings(formData);
    setSaved(formData);
    setSavedNote(true);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setSavedNote(false), 3000);
  };

  const discard = () => { setFormData(saved); setErrors({}); };

  // ── Telegram ───────────────────────────────────────────────
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(loadTelegramConfig);
  const [tgSavedConfig, setTgSavedConfig] = useState<TelegramConfig>(loadTelegramConfig);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showToken, setShowToken] = useState(false);

  const saveTelegram = () => {
    saveTelegramConfig(tgConfig);
    setTgSavedConfig(tgConfig);
    setTgResult({ ok: true, message: 'Telegram details saved on this computer.' });
    setTimeout(() => setTgResult(null), 3000);
  };

  const testTelegram = async () => {
    if (!tgConfig.botToken || !tgConfig.chatId) { setTgResult({ ok: false, message: 'Enter the bot token and chat ID first.' }); return; }
    setTgTesting(true); setTgResult(null);
    saveTelegramConfig(tgConfig); setTgSavedConfig(tgConfig);
    const result = await sendTelegramMessage(tgConfig.botToken, tgConfig.chatId, TelegramMessages.testMessage());
    setTgTesting(false);
    setTgResult(result.ok ? { ok: true, message: 'Test message sent. Check Telegram.' } : { ok: false, message: result.error || 'Could not send. Check the bot token and chat ID.' });
  };

  const [bulkSending, setBulkSending] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<{ count: number } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);
  const bulkStop = useRef(false);

  const planBulk = async () => {
    if (!tgSavedConfig.botToken || !tgSavedConfig.chatId) { setBulkResult({ ok: false, message: 'Save your Telegram details first.' }); return; }
    setBulkResult(null);
    try {
      const delivered = (await DataService.getOrders()).filter((o) => o.status === 'Delivered');
      if (delivered.length === 0) setBulkResult({ ok: true, message: 'There are no delivered orders to send.' });
      else setBulkPlan({ count: delivered.length });
    } catch { setBulkResult({ ok: false, message: 'Could not load orders. Try again.' }); }
  };

  const runBulk = async () => {
    setBulkPlan(null); setBulkSending(true); setBulkProgress(null); setBulkResult(null); bulkStop.current = false;
    try {
      const delivered = (await DataService.getOrders()).filter((o) => o.status === 'Delivered');
      await sendTelegramMessage(tgSavedConfig.botToken, tgSavedConfig.chatId, TelegramMessages.bulkSummaryHeader(delivered.length));
      let sent = 0;
      for (let i = 0; i < delivered.length; i++) {
        if (bulkStop.current) break;
        setBulkProgress({ done: i, total: delivered.length });
        await sendTelegramMessage(tgSavedConfig.botToken, tgSavedConfig.chatId, TelegramMessages.orderDelivered(delivered[i]));
        sent = i + 1;
        if (i < delivered.length - 1) await new Promise((r) => setTimeout(r, 1200)); // stay under Telegram's rate limit
      }
      setBulkProgress({ done: sent, total: delivered.length });
      setBulkResult({ ok: true, message: bulkStop.current ? `Stopped after ${sent} of ${delivered.length} orders.` : `Sent ${sent} delivered order${sent === 1 ? '' : 's'} to Telegram.` });
    } catch (err: unknown) {
      setBulkResult({ ok: false, message: (err as Error)?.message || 'Something went wrong.' });
    } finally { setBulkSending(false); }
  };

  // ── Integrations ───────────────────────────────────────────
  const [integrations, setIntegrations] = useState<IntegrationSetting[]>([]);
  const [loadingInt, setLoadingInt] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<Record<string, string>>({});
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  const loadIntegrations = async () => {
    setLoadingInt(true);
    setIntegrations(await IntegrationService.getAll());
    setLoadingInt(false);
  };

  useEffect(() => { if (section === 'integrations') void loadIntegrations(); }, [section]);

  const testOne = async (id: string) => {
    setTestingId(id);
    const result = await IntegrationService.testConnection(id);
    setTestResults((p) => ({ ...p, [id]: result }));
    await loadIntegrations(); // refresh the connected status
    setTestingId(null);
  };

  const saveKeys = async (id: string) => {
    setSavingId(id);
    await IntegrationService.saveCredentials(id, formValues);
    setEditingId(null); setFormValues({}); setSavingId(null);
    await testOne(id); // keys are write-only now, so test straight away to show whether they work
  };

  const disconnect = async (id: string) => {
    await IntegrationService.disconnect(id);
    setDisconnectId(null);
    setTestResults((p) => { const n = { ...p }; delete n[id]; return n; });
    await loadIntegrations();
  };

  const importFrom = async (platform: 'shopify' | 'woocommerce') => {
    setImportingId(platform);
    const result = await IntegrationService.importOrders(platform);
    setImportResults((p) => ({ ...p, [platform]: result.error ? `Error: ${result.error}` : `Imported ${result.imported} of ${result.total} orders` }));
    setImportingId(null);
  };

  const fieldsFor = (platform: string) => {
    switch (platform) {
      case 'Delhivery': return [{ key: 'api_key', label: 'API token', placeholder: 'Your Delhivery API token', type: 'password' }];
      case 'Shiprocket': return [
        { key: 'email', label: 'Email address', placeholder: 'you@example.com', type: 'email' },
        { key: 'api_key', label: 'Password', placeholder: 'Your Shiprocket password', type: 'password' },
      ];
      case 'Shopify': return [
        { key: 'store_url', label: 'Store URL', placeholder: 'your-store.myshopify.com', type: 'text' },
        { key: 'api_key', label: 'Admin API access token', placeholder: 'shpat_xxxx…', type: 'password' },
      ];
      case 'WooCommerce': return [
        { key: 'store_url', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'text' },
        { key: 'api_key', label: 'Consumer key', placeholder: 'ck_xxxx…', type: 'password' },
        { key: 'api_secret', label: 'Consumer secret', placeholder: 'cs_xxxx…', type: 'password' },
      ];
      default: return [{ key: 'api_key', label: 'API key', placeholder: 'API key', type: 'password' }];
    }
  };

  const platformIcon = (platform: string) => {
    if (platform === 'Delhivery' || platform === 'Shiprocket') return <Truck className="w-5 h-5" />;
    if (platform === 'Amazon' || platform === 'Flipkart') return <Store className="w-5 h-5" />;
    return <Building2 className="w-5 h-5" />;
  };

  const connected = integrations.filter((i) => i.is_active).length;
  const logoOk = /^(https?:\/\/|\/|data:image)/.test(formData.logoUrl.trim());

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-28 md:pb-10">
      <header className="mb-6">
        <h2 className="text-2xl font-bold k-display">Settings</h2>
        <p className="text-sm k-muted mt-1">Company details, labels, couriers and alerts.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-6 items-start">
        {/* Section list: a column on desktop, a scrolling row on phones */}
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-28">
          <ul className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0 -mx-1 px-1">
            {SECTIONS.map((s) => {
              const on = section === s.key;
              return (
                <li key={s.key} className="shrink-0 lg:shrink">
                  <button onClick={() => setSection(s.key)} aria-current={on ? 'page' : undefined} className="w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors whitespace-nowrap lg:whitespace-normal" style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--card)', border: '1px solid var(--line)' }}>
                    <span className="shrink-0" style={on ? undefined : { color: 'var(--lime-text)' }}>{s.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{s.label}</span>
                      <span className="hidden lg:block text-xs mt-0.5" style={{ opacity: 0.65 }}>{s.hint}</span>
                    </span>
                    {s.key === 'warehouse' && (errors.pinCode || errors.phone) ? <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--bad)' }} aria-label="Needs a fix" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {savedNote && <p role="status" className="k-card2 rounded-2xl px-4 py-3 text-sm font-semibold flex items-center gap-2"><Check className="w-4 h-4 k-lime-text" /> Settings saved.</p>}

          {/* COMPANY */}
          {section === 'company' && (
            <form onSubmit={handleSave} className="k-card p-5 sm:p-6 space-y-5 k-rise" style={{ ['--i' as string]: 0 }}>
              <div><h3 className="text-lg font-bold k-display">Company</h3><p className="text-sm k-muted mt-0.5">Shown on labels, the sidebar and warranty cards.</p></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="s-company" label="Company name" error={errors.companyName}>
                  <input id="s-company" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className="k-field font-semibold" />
                </Field>
                <Field id="s-tagline" label="Tagline">
                  <input id="s-tagline" value={formData.tagline} onChange={(e) => setFormData({ ...formData, tagline: e.target.value })} className="k-field" />
                </Field>
              </div>
              <div className="grid sm:grid-cols-[1fr_9rem] gap-4 items-start">
                <Field id="s-logo" label="Logo address" hint="A link to a black and white image. It is inverted automatically in dark mode.">
                  <input id="s-logo" value={formData.logoUrl} onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })} className="k-field font-mono text-xs" />
                </Field>
                <div>
                  <p className="k-label">Preview</p>
                  <div className="k-card2 rounded-2xl h-[5.25rem] flex items-center justify-center">
                    {logoOk ? <img src={formData.logoUrl} alt="Logo preview" className="max-h-14 max-w-[80%] object-contain dark:invert" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <span className="text-xs k-muted">No logo</span>}
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* WAREHOUSE */}
          {section === 'warehouse' && (
            <form onSubmit={handleSave} className="k-card p-5 sm:p-6 space-y-5 k-rise" style={{ ['--i' as string]: 0 }}>
              <div><h3 className="text-lg font-bold k-display">Sender address</h3><p className="text-sm k-muted mt-0.5">Where parcels are sent from.</p></div>
              <p className="k-card2 rounded-2xl px-4 py-3 text-sm" role="note"><span className="font-semibold">Printed on every label.</span> This is the “From” address on COD and Prepaid labels. Check the preview in New order after you change it.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="s-wperson" label="Name on labels" hint="Shown as the sender. If empty, the facility name is used."><input id="s-wperson" value={formData.warehouse.contactPerson || ''} onChange={(e) => setWarehouse({ contactPerson: e.target.value })} className="k-field font-semibold" /></Field>
                <Field id="s-wname" label="Facility name"><input id="s-wname" value={formData.warehouse.companyName} onChange={(e) => setWarehouse({ companyName: e.target.value })} className="k-field" /></Field>
                <Field id="s-wphone" label="Dispatch phone" error={errors.phone}><input id="s-wphone" inputMode="tel" value={formData.warehouse.phone} onChange={(e) => setWarehouse({ phone: e.target.value })} className="k-field font-mono" /></Field>
              </div>
              <Field id="s-waddr" label="Address"><input id="s-waddr" value={formData.warehouse.addressLine} onChange={(e) => setWarehouse({ addressLine: e.target.value })} className="k-field" /></Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field id="s-wcity" label="City"><input id="s-wcity" value={formData.warehouse.city} onChange={(e) => setWarehouse({ city: e.target.value })} className="k-field" /></Field>
                <Field id="s-wstate" label="State"><input id="s-wstate" value={formData.warehouse.state} onChange={(e) => setWarehouse({ state: e.target.value })} className="k-field" /></Field>
                <Field id="s-wpin" label="PIN code" error={errors.pinCode}><input id="s-wpin" inputMode="numeric" maxLength={6} value={formData.warehouse.pinCode} onChange={(e) => setWarehouse({ pinCode: digits(e.target.value) })} className="k-field font-mono font-semibold" /></Field>
              </div>
            </form>
          )}

          {/* PRINTING */}
          {section === 'printing' && (
            <form onSubmit={handleSave} className="k-card p-5 sm:p-6 space-y-6 k-rise" style={{ ['--i' as string]: 0 }}>
              <div><h3 className="text-lg font-bold k-display">Labels and printing</h3><p className="text-sm k-muted mt-0.5">How labels come out of your thermal printer.</p></div>
              <div>
                <p className="k-label">Paper size</p>
                <Choice label="Paper size" value={formData.paperSize} onChange={(v) => setFormData({ ...formData, paperSize: v as CompanySettings['paperSize'] })} options={[{ value: '100x150mm', label: '100 × 150 mm', note: 'Standard 4×6 inch' }, { value: '100x100mm', label: '100 × 100 mm', note: '4×4 inch square' }]} />
              </div>
              <div>
                <p className="k-label">Print quality</p>
                <Choice label="Print quality" value={String(formData.dpi)} onChange={(v) => setFormData({ ...formData, dpi: parseInt(v, 10) as 300 | 200 })} options={[{ value: '300', label: '300 DPI', note: 'Sharpest' }, { value: '200', label: '200 DPI', note: 'Faster' }]} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="s-courier" label="Courier used by default">
                  <select id="s-courier" value={formData.defaultCourier} onChange={(e) => setFormData({ ...formData, defaultCourier: e.target.value as CourierName })} className="k-field">
                    {['Delhivery', 'DTDC', 'India Post', 'Shiprocket', 'NimbusPost', 'Bluedart'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <div>
                  <p className="k-label">Payment used by default</p>
                  <Choice label="Default payment" value={formData.defaultPaymentType} onChange={(v) => setFormData({ ...formData, defaultPaymentType: v as PaymentType })} options={[{ value: 'COD', label: 'COD' }, { value: 'Prepaid', label: 'Prepaid' }]} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 k-card2 rounded-2xl px-4 py-4">
                <div><p className="text-sm font-semibold">Mark orders Printed automatically</p><p className="text-xs k-muted mt-0.5">When you press print, the order moves to Printed.</p></div>
                <Switch on={formData.autoMarkPrintedOnPrint} onChange={(v) => setFormData({ ...formData, autoMarkPrintedOnPrint: v })} label="Mark orders Printed automatically" />
              </div>
            </form>
          )}

          {/* INTEGRATIONS */}
          {section === 'integrations' && (
            <div className="space-y-4">
              <div className="k-card p-5 sm:p-6 flex items-start justify-between gap-3">
                <div><h3 className="text-lg font-bold k-display">Couriers and stores</h3><p className="text-sm k-muted mt-0.5">{loadingInt ? 'Loading…' : `${connected} of ${integrations.length} connected. Keys are saved on the server and never shown again.`}</p></div>
                <button onClick={() => void loadIntegrations()} aria-label="Refresh connections" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><RefreshCw className={`w-4 h-4 ${loadingInt ? 'animate-spin' : ''}`} /></button>
              </div>

              {loadingInt && integrations.length === 0 ? (
                <div className="k-card p-4 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="k-skel h-16 rounded-2xl animate-pulse" />)}</div>
              ) : integrations.length === 0 ? (
                <div className="k-card py-12 px-6 text-center"><p className="font-bold">No connections available</p><p className="text-sm k-muted mt-1">Check your connection and refresh.</p></div>
              ) : (
                <ul className="k-card overflow-hidden">
                  {integrations.map((int) => {
                    const isEditing = editingId === int.id;
                    const isTesting = testingId === int.id;
                    const result = testResults[int.id];
                    const canImport = int.platform === 'Shopify' || int.platform === 'WooCommerce';
                    return (
                      <li key={int.id} className="border-t k-rule first:border-t-0 px-5 py-4">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="w-11 h-11 rounded-2xl k-card2 flex items-center justify-center shrink-0 k-lime-text">{platformIcon(int.platform)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{int.name}</p>
                            <p className="text-xs k-muted">
                              {int.is_active ? <>Connected{int.last_verified && ` · checked ${new Date(int.last_verified).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}{int.last_sync && ` · last import ${new Date(int.last_sync).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</> : 'Not connected'}
                            </p>
                          </div>
                          <span className="rounded-full px-3 py-1 text-xs font-bold shrink-0" style={int.is_active ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { background: 'var(--card2)' }}>{int.is_active ? 'Connected' : 'Off'}</span>
                          {!isEditing && (
                            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                              {int.is_active ? (
                                <>
                                  {canImport && <button onClick={() => void importFrom(int.platform.toLowerCase() as 'shopify' | 'woocommerce')} disabled={importingId === int.platform.toLowerCase()} className="k-btn k-btn-outline-green px-4 py-2 text-sm">{importingId === int.platform.toLowerCase() ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Import orders</button>}
                                  <button onClick={() => void testOne(int.id)} disabled={isTesting} className="k-btn k-btn-soft px-4 py-2 text-sm">{isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Test</button>
                                  <button onClick={() => setDisconnectId(disconnectId === int.id ? null : int.id)} className="k-btn k-btn-soft px-4 py-2 text-sm">Disconnect</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setEditingId(int.id); setFormValues({}); }} className="k-btn k-btn-lime px-4 py-2 text-sm">Add keys</button>
                                  <button onClick={() => void testOne(int.id)} disabled={isTesting} className="k-btn k-btn-soft px-4 py-2 text-sm" title="Check keys you saved earlier">{isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Test saved keys</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {result && <p role="status" className="text-sm font-medium mt-3 flex items-center gap-2" style={result.success ? undefined : { color: 'var(--bad)' }}>{result.success ? <Check className="w-4 h-4 k-lime-text" /> : <X className="w-4 h-4" />}{result.success ? 'Connection works.' : `Could not connect. ${result.error || ''}`}</p>}
                        {importResults[int.platform.toLowerCase()] && <p className="text-sm font-medium mt-3">{importResults[int.platform.toLowerCase()]}</p>}

                        {disconnectId === int.id && (
                          <div role="alert" className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
                            <p className="text-sm font-medium">Disconnect {int.name}? Your saved keys are removed.</p>
                            <div className="flex gap-2"><button onClick={() => setDisconnectId(null)} className="k-btn k-btn-ghost px-4 py-2 text-sm">Keep it</button><button onClick={() => void disconnect(int.id)} className="k-btn k-btn-ink px-4 py-2 text-sm">Yes, disconnect</button></div>
                          </div>
                        )}

                        {isEditing && (
                          <form onSubmit={(e) => { e.preventDefault(); void saveKeys(int.id); }} className="mt-4 k-card2 rounded-2xl p-4 space-y-3">
                            {fieldsFor(int.platform).map((f) => (
                              <Field key={f.key} id={`k-${int.id}-${f.key}`} label={f.label}>
                                <input id={`k-${int.id}-${f.key}`} type={f.type} autoComplete="off" placeholder={f.placeholder} value={formValues[f.key] || ''} onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))} className="k-field font-mono text-sm" />
                              </Field>
                            ))}
                            <div className="flex gap-2 pt-1">
                              <button type="submit" disabled={savingId === int.id} className="k-btn k-btn-lime px-5 py-2.5 text-sm">{savingId === int.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save and test</button>
                              <button type="button" onClick={() => { setEditingId(null); setFormValues({}); }} className="k-btn k-btn-ghost px-5 py-2.5 text-sm">Cancel</button>
                            </div>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* TELEGRAM */}
          {section === 'telegram' && (
            <div className="space-y-4">
              <div className="k-card p-5 sm:p-6 k-rise" style={{ ['--i' as string]: 0 }}>
                <h3 className="text-lg font-bold k-display">Telegram alerts</h3>
                <p className="text-sm k-muted mt-0.5">A message on your phone when an order ships, is delivered or is cancelled.</p>

                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  <Field id="tg-token" label="Bot token" hint="From @BotFather. Looks like 123456789:ABCdef…">
                    <div className="relative">
                      <input id="tg-token" type={showToken ? 'text' : 'password'} autoComplete="off" placeholder="123456789:ABCdef…" value={tgConfig.botToken} onChange={(e) => setTgConfig((p) => ({ ...p, botToken: e.target.value.trim() }))} className="k-field font-mono text-sm pr-11" />
                      <button type="button" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? 'Hide token' : 'Show token'} className="absolute right-3 top-1/2 -translate-y-1/2 k-muted">{showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    </div>
                  </Field>
                  <Field id="tg-chat" label="Chat ID" hint="From @userinfobot. A number like 987654321.">
                    <input id="tg-chat" autoComplete="off" placeholder="e.g. 123456789" value={tgConfig.chatId} onChange={(e) => setTgConfig((p) => ({ ...p, chatId: e.target.value.trim() }))} className="k-field font-mono text-sm" />
                  </Field>
                </div>

                {tgResult && <p role="status" className="text-sm font-medium mt-4 flex items-center gap-2" style={tgResult.ok ? undefined : { color: 'var(--bad)' }}>{tgResult.ok ? <Check className="w-4 h-4 k-lime-text" /> : <X className="w-4 h-4" />}{tgResult.message}</p>}

                <div className="flex gap-2 flex-wrap mt-5">
                  <button onClick={() => void testTelegram()} disabled={tgTesting || !tgConfig.botToken || !tgConfig.chatId} className="k-btn k-btn-lime px-5 py-3 text-sm">{tgTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {tgTesting ? 'Sending…' : 'Send a test message'}</button>
                  <button onClick={saveTelegram} disabled={!tgConfig.botToken || !tgConfig.chatId || JSON.stringify(tgConfig) === JSON.stringify(tgSavedConfig)} className="k-btn k-btn-soft px-5 py-3 text-sm"><Save className="w-4 h-4" /> Save</button>
                </div>
                <p className="text-xs k-muted mt-3">These details are kept in this browser only. Anyone using this computer can read them.</p>
              </div>

              <details className="k-card2 rounded-[24px] px-5 py-4 group">
                <summary className="cursor-pointer font-semibold text-sm list-none flex items-center justify-between">How to set it up (2 minutes)<span className="k-muted text-xs">Show steps</span></summary>
                <ol className="mt-4 space-y-2.5 text-sm">
                  {[
                    <>Open Telegram and search for <a className="font-bold underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>.</>,
                    <>Send <span className="font-mono">/newbot</span>, name your bot, and copy the token it gives you.</>,
                    <>Open <a className="font-bold underline" href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a> and send any message. Copy your chat ID.</>,
                    <>Open your new bot once and press Start, so it is allowed to message you.</>,
                    <>Paste both above and press “Send a test message”.</>,
                  ].map((t, i) => <li key={i} className="flex gap-3"><span className="font-bold w-4 tabular-nums">{i + 1}</span><span>{t}</span></li>)}
                </ol>
              </details>

              <div className="k-card p-5 sm:p-6">
                <h4 className="font-bold k-display">What you will receive</h4>
                <ul className="mt-3 divide-y k-rule">
                  {[['Order shipped', 'When you add a tracking number to an order'], ['Order delivered', 'When an order is marked Delivered'], ['Order cancelled', 'When you cancel an order']].map(([t, d]) => (
                    <li key={t} className="py-3 flex items-baseline justify-between gap-4"><span className="font-semibold text-sm">{t}</span><span className="text-sm k-muted text-right">{d}</span></li>
                  ))}
                </ul>
              </div>

              <div className="k-card p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-2xl k-card2 flex items-center justify-center shrink-0"><History className="w-4 h-4 k-lime-text" /></span>
                  <div><h4 className="font-bold k-display">Send past delivered orders</h4><p className="text-sm k-muted mt-0.5">Posts one message for every order already marked Delivered, with customer, phone, pincode, product, tracking number and date.</p></div>
                </div>

                {bulkSending && bulkProgress && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full k-track overflow-hidden"><div className="h-full rounded-full k-bar" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, transition: 'width .3s' }} /></div>
                    <p className="text-sm k-muted mt-2 tabular-nums">Sending {bulkProgress.done} of {bulkProgress.total}. Keep this page open.</p>
                  </div>
                )}
                {bulkResult && <p role="status" className="text-sm font-medium mt-4 flex items-center gap-2" style={bulkResult.ok ? undefined : { color: 'var(--bad)' }}>{bulkResult.ok ? <Check className="w-4 h-4 k-lime-text" /> : <X className="w-4 h-4" />}{bulkResult.message}</p>}

                {bulkPlan && (
                  <div role="alert" className="mt-4 k-card2 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-medium">This sends <span className="font-bold">{bulkPlan.count}</span> messages and takes about {Math.max(1, Math.round((bulkPlan.count * 1.2) / 60))} minute{Math.round((bulkPlan.count * 1.2) / 60) > 1 ? 's' : ''}.</p>
                    <div className="flex gap-2"><button onClick={() => setBulkPlan(null)} className="k-btn k-btn-ghost px-4 py-2 text-sm">Cancel</button><button onClick={() => void runBulk()} className="k-btn k-btn-lime px-4 py-2 text-sm">Send {bulkPlan.count} messages</button></div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {bulkSending ? (
                    <button onClick={() => { bulkStop.current = true; }} className="k-btn k-btn-ink px-5 py-3 text-sm"><X className="w-4 h-4" /> Stop sending</button>
                  ) : (
                    <button onClick={() => void planBulk()} disabled={!tgSavedConfig.botToken || !tgSavedConfig.chatId || !!bulkPlan} className="k-btn k-btn-soft px-5 py-3 text-sm"><History className="w-4 h-4" /> Review and send</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Unsaved changes bar */}
          {formSection && dirty && (
            <div className="sticky bottom-4 z-20 k-card shadow-2xl px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap k-rise" style={{ ['--i' as string]: 0 }} role="region" aria-label="Unsaved changes">
              <p className="text-sm font-semibold">You have unsaved changes</p>
              <div className="flex gap-2">
                <button onClick={discard} className="k-btn k-btn-ghost px-4 py-2.5 text-sm">Discard</button>
                <button onClick={() => handleSave()} className="k-btn k-btn-lime px-5 py-2.5 text-sm"><Save className="w-4 h-4" /> Save changes</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

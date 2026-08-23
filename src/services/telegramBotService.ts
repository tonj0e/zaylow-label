/**
 * Telegram Bot Command Listener
 *
 * Polls the Telegram Bot API for incoming messages while the app is open,
 * parses commands, fetches live data from Supabase, and replies automatically.
 *
 * Supported commands (case-insensitive, with or without /):
 *   /help      → List all commands
 *   /today     → Today's order summary
 *   /delivered → Today's delivered orders with details
 *   /pending   → All pending orders
 *   /summary   → Overall stats across all orders
 */

import type { Order } from '../types';
import { sendTelegramMessage } from './telegramService';
import { DataService } from './dataService';

let _pollingInterval: ReturnType<typeof setInterval> | null = null;
let _lastUpdateId = 0;

// ─── helpers ────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === todayString();
}

// ─── command handlers ────────────────────────────────────────────────────────

async function handleHelp(): Promise<string> {
  return (
    `<b>🤖 ZAYLOW Bot Commands</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n\n` +
    `<b>/today</b> — Today's order summary\n` +
    `<b>/delivered</b> — Today's delivered orders\n` +
    `<b>/pending</b> — All pending orders\n` +
    `<b>/summary</b> — Overall stats (all orders)\n` +
    `<b>/help</b> — Show this list\n\n` +
    `<i>Note: The app must be open in Chrome for the bot to reply.</i>`
  );
}

async function handleToday(orders: Order[]): Promise<string> {
  const today = orders.filter(o => isToday(o.createdAt));
  const pending   = today.filter(o => o.status === 'Pending').length;
  const processing= today.filter(o => o.status === 'Processing').length;
  const printed   = today.filter(o => ['Label Generated', 'Printed'].includes(o.status)).length;
  const shipped   = today.filter(o => o.status === 'Shipped').length;
  const delivered = today.filter(o => o.status === 'Delivered').length;
  const cancelled = today.filter(o => o.status === 'Cancelled').length;
  const cod       = today.filter(o => o.paymentType === 'COD').reduce((s, o) => s + (o.codAmount || 0), 0);

  if (today.length === 0) {
    return `<b>📅 Today (${fmtDate(new Date().toISOString())})</b>\n\nNo orders placed today yet.`;
  }

  return (
    `<b>📅 Today's Summary</b>\n` +
    `<b>Date:</b> ${fmtDate(new Date().toISOString())}\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n\n` +
    `<b>Total Orders:</b> ${today.length}\n\n` +
    `🟡 Pending: ${pending}\n` +
    `🔵 Processing: ${processing}\n` +
    `🖨 Printed/Generated: ${printed}\n` +
    `📦 Shipped: ${shipped}\n` +
    `✅ Delivered: ${delivered}\n` +
    `❌ Cancelled: ${cancelled}\n\n` +
    `<b>💰 COD Collection: Rs.${cod.toLocaleString('en-IN')}</b>`
  );
}

async function handleDelivered(orders: Order[]): Promise<string> {
  const todayDelivered = orders.filter(o => o.status === 'Delivered' && isToday(o.createdAt));

  if (todayDelivered.length === 0) {
    return `<b>✅ Today's Delivered Orders</b>\n\nNo orders delivered today.`;
  }

  const lines = todayDelivered.map((o, i) =>
    `<b>${i + 1}. ${o.id}</b>\n` +
    `   👤 ${o.customer.name}  📞 ${o.customer.phone}\n` +
    `   📍 ${o.customer.city} - ${o.customer.pinCode}\n` +
    `   🛍 ${o.item.productName} x${o.item.quantity}\n` +
    (o.trackingNumber ? `   🚚 ${o.trackingNumber.toUpperCase()}\n` : '')
  ).join('\n');

  return (
    `<b>✅ Today's Delivered Orders (${todayDelivered.length})</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n\n` +
    lines
  );
}

async function handlePending(orders: Order[]): Promise<string> {
  const pending = orders.filter(o => o.status === 'Pending');

  if (pending.length === 0) {
    return `<b>🟡 Pending Orders</b>\n\nNo pending orders right now!`;
  }

  const lines = pending.slice(0, 15).map((o, i) =>
    `<b>${i + 1}. ${o.id}</b>\n` +
    `   👤 ${o.customer.name}  📞 ${o.customer.phone}\n` +
    `   📍 ${o.customer.city} - ${o.customer.pinCode}\n` +
    `   🛍 ${o.item.productName} x${o.item.quantity}\n` +
    `   📅 ${fmtDate(o.createdAt)}`
  ).join('\n\n');

  const extra = pending.length > 15 ? `\n\n<i>...and ${pending.length - 15} more orders</i>` : '';

  return (
    `<b>🟡 Pending Orders (${pending.length})</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n\n` +
    lines + extra
  );
}

async function handleSummary(orders: Order[]): Promise<string> {
  const total     = orders.length;
  const pending   = orders.filter(o => o.status === 'Pending').length;
  const shipped   = orders.filter(o => o.status === 'Shipped').length;
  const delivered = orders.filter(o => o.status === 'Delivered').length;
  const cancelled = orders.filter(o => o.status === 'Cancelled').length;
  const returned  = orders.filter(o => o.status === 'Returned').length;
  const cod       = orders.filter(o => o.paymentType === 'COD').reduce((s, o) => s + (o.codAmount || 0), 0);
  const todayCount = orders.filter(o => isToday(o.createdAt)).length;

  return (
    `<b>📊 Overall Summary</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n\n` +
    `<b>Total Orders:</b> ${total}\n` +
    `<b>Today's Orders:</b> ${todayCount}\n\n` +
    `🟡 Pending: ${pending}\n` +
    `📦 Shipped: ${shipped}\n` +
    `✅ Delivered: ${delivered}\n` +
    `❌ Cancelled: ${cancelled}\n` +
    `↩️ Returned: ${returned}\n\n` +
    `<b>💰 Total COD Value: Rs.${cod.toLocaleString('en-IN')}</b>`
  );
}

// ─── message dispatcher ──────────────────────────────────────────────────────

async function dispatchCommand(text: string, botToken: string, chatId: string): Promise<void> {
  const cmd = text.trim().toLowerCase().replace(/^\//, '');

  let reply: string;
  try {
    const orders = await DataService.getOrders();
    if (cmd === 'help' || cmd === 'start') {
      reply = await handleHelp();
    } else if (cmd === 'today' || cmd.startsWith('today')) {
      reply = await handleToday(orders);
    } else if (cmd === 'delivered' || cmd.startsWith('delivered')) {
      reply = await handleDelivered(orders);
    } else if (cmd === 'pending' || cmd.startsWith('pending')) {
      reply = await handlePending(orders);
    } else if (cmd === 'summary' || cmd === 'stats') {
      reply = await handleSummary(orders);
    } else {
      reply =
        `❓ Unknown command: <b>${text}</b>\n\n` +
        `Send /help to see all available commands.`;
    }
  } catch {
    reply = `⚠️ Error fetching data. Make sure the app is open and connected.`;
  }

  await sendTelegramMessage(botToken, chatId, reply);
}

// ─── polling ─────────────────────────────────────────────────────────────────

async function pollOnce(botToken: string, chatId: string): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?offset=${_lastUpdateId + 1}&timeout=0&limit=10`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      _lastUpdateId = update.update_id;

      const msg = update.message;
      if (!msg || !msg.text) continue;

      // Only respond to messages from the configured chat
      const fromChat = String(msg.chat?.id ?? '');
      if (fromChat !== chatId) continue;

      await dispatchCommand(msg.text, botToken, chatId);
    }
  } catch {
    // Network error or timeout — silently ignore, try again next interval
  }
}

/** Start polling for bot commands. Call once when the app loads. */
export function startTelegramPolling(botToken: string, chatId: string): void {
  if (_pollingInterval) return; // already running
  if (!botToken || !chatId) return;

  // Poll immediately then every 30 seconds
  pollOnce(botToken, chatId);
  _pollingInterval = setInterval(() => pollOnce(botToken, chatId), 30_000);
}

/** Stop polling (e.g. when config changes). */
export function stopTelegramPolling(): void {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
    _lastUpdateId = 0;
  }
}

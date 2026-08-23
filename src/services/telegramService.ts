/**
 * Telegram Notification Service
 *
 * Sends automatic notifications to your Telegram account via a Bot.
 * All messages go through the official Telegram Bot API.
 */

import type { Order } from '../types';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Load saved Telegram config from localStorage */
export function loadTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem('zaylow_telegram_config');
    return raw ? JSON.parse(raw) : { botToken: '', chatId: '' };
  } catch {
    return { botToken: '', chatId: '' };
  }
}

/** Save Telegram config to localStorage */
export function saveTelegramConfig(config: TelegramConfig): void {
  localStorage.setItem('zaylow_telegram_config', JSON.stringify(config));
}

/** Send a Telegram message. Returns true on success. */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken || !chatId) {
    return { ok: false, error: 'Bot token or Chat ID is missing.' };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await res.json();
    if (data.ok) return { ok: true };
    return { ok: false, error: data.description || 'Telegram API error' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

/** Format a date string nicely */
function fmtDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/** Pre-built notification messages with full order details */
export const TelegramMessages = {

  orderShipped: (order: Order, trackingNumber: string) =>
    `<b>📦 Order Shipped!</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n` +
    `<b>Order ID:</b> ${order.id}\n` +
    `<b>Date:</b> ${fmtDate(order.createdAt)}\n\n` +
    `<b>👤 Customer</b>\n` +
    `Name: ${order.customer.name}\n` +
    `Phone: ${order.customer.phone}\n` +
    `Pincode: ${order.customer.pinCode}\n` +
    `City: ${order.customer.city}, ${order.customer.state}\n\n` +
    `<b>🛍 Product</b>\n` +
    `${order.item.productName} x${order.item.quantity}\n\n` +
    `<b>🚚 Courier:</b> ${order.courier}\n` +
    `<b>Tracking No:</b> <code>${trackingNumber.toUpperCase()}</code>\n` +
    `<b>Payment:</b> ${order.paymentType}${order.paymentType === 'COD' ? ` (Rs.${order.codAmount})` : ''}`,

  orderDelivered: (order: Order, deliveredDate?: string) =>
    `<b>✅ Order Delivered!</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n` +
    `<b>Order ID:</b> ${order.id}\n` +
    `<b>Order Date:</b> ${fmtDate(order.createdAt)}\n` +
    `<b>Delivered On:</b> ${deliveredDate ? fmtDate(deliveredDate) : fmtDate(new Date().toISOString())}\n\n` +
    `<b>👤 Customer</b>\n` +
    `Name: ${order.customer.name}\n` +
    `Phone: ${order.customer.phone}\n` +
    `Pincode: ${order.customer.pinCode}\n` +
    `City: ${order.customer.city}, ${order.customer.state}\n\n` +
    `<b>🛍 Product</b>\n` +
    `${order.item.productName} x${order.item.quantity}\n\n` +
    `<b>🚚 Courier:</b> ${order.courier}\n` +
    (order.trackingNumber ? `<b>Tracking No:</b> <code>${order.trackingNumber.toUpperCase()}</code>\n` : '') +
    `<b>Payment:</b> ${order.paymentType}${order.paymentType === 'COD' ? ` (Rs.${order.codAmount})` : ''}`,

  orderCancelled: (order: Order) =>
    `<b>❌ Order Cancelled</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n` +
    `<b>Order ID:</b> ${order.id}\n` +
    `<b>Date:</b> ${fmtDate(order.createdAt)}\n\n` +
    `<b>👤 Customer</b>\n` +
    `Name: ${order.customer.name}\n` +
    `Phone: ${order.customer.phone}\n` +
    `Pincode: ${order.customer.pinCode}\n\n` +
    `<b>🛍 Product:</b> ${order.item.productName} x${order.item.quantity}`,

  testMessage: () =>
    `<b>✅ ZAYLOW Connected!</b>\n\n` +
    `Your Telegram notifications are set up correctly.\n` +
    `You will now receive alerts when orders are shipped or delivered.`,

  bulkSummaryHeader: (count: number) =>
    `<b>📋 Historical Delivered Orders</b>\n` +
    `<b>━━━━━━━━━━━━━━━━━━</b>\n` +
    `Sending <b>${count}</b> delivered order(s) to Telegram...\n` +
    `(Each order will appear as a separate message below)`,
};

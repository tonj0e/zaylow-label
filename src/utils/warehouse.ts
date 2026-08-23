/**
 * Warehouse utility functions - week labels, ID generators, locking
 * Mirrors GAS utils.gs functionality for Supabase/React
 */

// ─── WEEK LABEL HELPERS ────────────────────────────────────────────────────────

/** Returns current date as "DD-MM-YYYY" (matches GAS getTodayStr) */
export function getTodayStr(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Formats any Date as "DD-MM-YYYY" */
export function getDateStr(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Returns ISO week number for a given date */
export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Returns weekly sheet label for Inventory Out / Movement: "Week XX - YYYY" */
export function getWeeklySheetName(prefix: 'OUT' | 'MOVE'): string {
  const now = new Date();
  return `${prefix} - Week ${getWeekNumber(now)} - ${now.getFullYear()}`;
}

/** Returns weekly sheet label for Returns: "RET - DD-MM-YYYY to DD-MM-YYYY" */
export function getReturnWeeklySheetName(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return `RET - ${getDateStr(monday)} to ${getDateStr(saturday)}`;
}

// ─── ID GENERATORS (matching GAS patterns) ────────────────────────────────────

/** Generate Inventory ID: INV01-DD-MM-YYYY */
export function generateInventoryId(existingCountToday: number): string {
  const seq = existingCountToday + 1;
  return `INV${String(seq).padStart(2, '0')}-${getTodayStr()}`;
}

/** Generate Carton ID: CT01-DD-MM-YYYY */
export function generateCartonId(cartonNum: number, dateStr?: string): string {
  return `CT${String(cartonNum).padStart(2, '0')}-${dateStr || getTodayStr()}`;
}

/** Generate Product ID: PD001-CT01-DD-MM-YYYY */
export function generateProductId(pieceNum: number, cartonId: string): string {
  return `PD${String(pieceNum).padStart(3, '0')}-${cartonId}`;
}

/** Generate Order ID: ZLOD0000001 (sequential) */
export function generateOrderId(existingMaxSeq: number): string {
  const seq = existingMaxSeq + 1;
  return `ZLOD${String(seq).padStart(7, '0')}`;
}

/** Generate Return ID: RET-001 (sequential per week) */
export function generateReturnId(existingCount: number): string {
  const seq = existingCount + 1;
  return `RET-${String(seq).padStart(3, '0')}`;
}

// ─── APPLICATION-LEVEL LOCK (simple mutex for atomic operations) ──────────────

const locks = new Map<string, Promise<void>>();

/**
 * Executes fn() inside an application-level lock to prevent concurrent writes.
 * Not as robust as GAS LockService but helps with race conditions in React.
 * For true atomicity, use Supabase RPC functions (recommended).
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait for existing lock on this key
  const existingLock = locks.get(key);
  if (existingLock) {
    await existingLock;
  }

  // Create new lock
  let releaseLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  locks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    releaseLock();
    locks.delete(key);
  }
}

// ─── QR CODE URL HELPER ───────────────────────────────────────────────────────

/** Returns a qrserver.com URL for QR code generation (matches GAS getQrUrl) */
export function getQrUrl(data: string, size: number = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&ecc=M&margin=4`;
}

// ─── TYPE DEFINITIONS FOR INVENTORY ITEMS ────────────────────────────────────

export interface InventoryItemInput {
  batch_id: string;
  carton_id: string;
  product_id: string;
  status: 'In Stock' | 'Sold' | 'Returned' | 'Damaged';
  order_id?: string | null;
  customer_name?: string | null;
  mobile?: string | null;
}

export interface InventoryItemRow {
  id: string;
  batch_id: string;
  carton_id: string;
  status: string;
  order_id: string | null;
  customer_name: string | null;
  mobile: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StockSummaryRow {
  product_name: string;
  sku: string | null;
  total_in: number;
  sold: number;
  returned: number;
  available: number;
  last_updated: string | null;
}

export interface OrderRow {
  id: string;
  date: string;
  customer_name: string;
  house_name: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  mobile: string | null;
  payment_type: string;
  cod_amount: number | null;
  courier: string | null;
  product_name: string | null;
  product_id: string | null;
  inventory_id: string | null;
  carton_id: string | null;
  status: string;
  tracking_id: string | null;
  shipping_label_url: string | null;
  delivered_date: string | null;
  warranty_start: string | null;
  warranty_end: string | null;
  return_reason: string | null;
  remarks: string | null;
  claim_date: string | null;
  claim_reason: string | null;
  claim_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReturnRow {
  id: number;
  week_label: string;
  date_received: string;
  order_id: string | null;
  customer: string | null;
  mobile: string | null;
  product: string | null;
  product_id: string | null;
  return_reason: string | null;
  courier: string | null;
  tracking_id: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface InventoryOutRow {
  id: number;
  week_label: string;
  date: string;
  order_id: string | null;
  product_id: string | null;
  carton_id: string | null;
  customer: string | null;
  mobile: string | null;
  courier: string | null;
  tracking_id: string | null;
  created_at: string | null;
}

export interface InventoryMovementRow {
  id: number;
  week_label: string;
  date: string;
  batch_or_product_id: string | null;
  order_id: string | null;
  movement: string | null;
  qty: string | null;
  remarks: string | null;
  created_at: string | null;
}
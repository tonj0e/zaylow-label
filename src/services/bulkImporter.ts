import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Order, CourierName, PaymentType } from '../types';

export interface ColumnMapping {
  orderId: string;
  customerName: string;
  phone: string;
  addressLine: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
  productName: string;
  sku: string;
  quantity: string;
  weightKg: string;
  courier: string;
  paymentType: string;
  codAmount: string;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

export class BulkImporterService {
  /**
   * Reads an uploaded File (.csv, .xlsx, .xls) and extracts headers and rows.
   */
  static async parseFile(file: File): Promise<ParsedSpreadsheet> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      return this.parseCSV(file);
    } else if (['xlsx', 'xls'].includes(extension || '')) {
      return this.parseExcel(file);
    } else {
      throw new Error('Unsupported file format. Please upload a .csv or .xlsx file.');
    }
  }

  private static parseCSV(file: File): Promise<ParsedSpreadsheet> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, any>[];
          resolve({
            headers,
            rows,
            totalRows: rows.length
          });
        },
        error: (err) => reject(err)
      });
    });
  }

  private static parseExcel(file: File): Promise<ParsedSpreadsheet> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

          if (rows.length === 0) {
            resolve({ headers: [], rows: [], totalRows: 0 });
            return;
          }

          const headers = Object.keys(rows[0]);
          resolve({
            headers,
            rows,
            totalRows: rows.length
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Automatically suggests column mapping based on standard header names.
   */
  static autoDetectMapping(headers: string[]): ColumnMapping {
    const findHeader = (keywords: string[]): string => {
      const match = headers.find(h => {
        const lower = h.toLowerCase().trim();
        return keywords.some(k => lower.includes(k));
      });
      return match || '';
    };

    return {
      orderId: findHeader(['order id', 'order_id', 'order no', 'orderno', 'id', 'ref']),
      customerName: findHeader(['customer name', 'name', 'recipient', 'ship to name', 'consignee']),
      phone: findHeader(['phone', 'mobile', 'contact', 'telephone', 'cell']),
      addressLine: findHeader(['address', 'address line 1', 'street', 'ship address']),
      landmark: findHeader(['landmark', 'address line 2', 'near']),
      city: findHeader(['city', 'town', 'destination city']),
      district: findHeader(['district', 'county']),
      state: findHeader(['state', 'province', 'region']),
      pinCode: findHeader(['pin', 'pincode', 'postal', 'zip', 'zipcode']),
      productName: findHeader(['product', 'item name', 'title', 'description']),
      sku: findHeader(['sku', 'product code', 'item sku']),
      quantity: findHeader(['qty', 'quantity', 'count']),
      weightKg: findHeader(['weight', 'weight (kg)', 'wt']),
      courier: findHeader(['courier', 'carrier', 'shipping partner']),
      paymentType: findHeader(['payment type', 'payment mode', 'cod/prepaid', 'pay mode']),
      codAmount: findHeader(['cod amount', 'cod value', 'collectable amount', 'amount'])
    };
  }

  /**
   * Converts spreadsheet rows into normalized Order objects based on user mapping.
   */
  static convertRowsToOrders(
    rows: Record<string, any>[],
    mapping: ColumnMapping,
    defaultCourier: CourierName = 'Delhivery',
    defaultPaymentType: PaymentType = 'COD'
  ): Order[] {
    return rows.map((row, idx) => {
      const orderId = String(row[mapping.orderId] || `ZYL-IMP-${Date.now()}-${idx + 1}`).trim();
      const customerName = String(row[mapping.customerName] || 'Valued Customer').trim();
      const phone = String(row[mapping.phone] || '+91 99999 99999').trim();
      const addressLine = String(row[mapping.addressLine] || 'Delivery Address Not Specified').trim();
      const landmark = row[mapping.landmark] ? String(row[mapping.landmark]).trim() : undefined;
      const city = String(row[mapping.city] || 'Main City').trim();
      const district = String(row[mapping.district] || city).trim();
      const state = String(row[mapping.state] || 'State').trim();
      const pinCode = String(row[mapping.pinCode] || '000000').trim();

      const productName = String(row[mapping.productName] || 'Standard Shipping Item').trim();
      const sku = String(row[mapping.sku] || 'ZYL-SKU-001').trim();
      const quantity = Math.max(1, parseInt(row[mapping.quantity]) || 1);
      const weightKg = Math.max(0.1, parseFloat(row[mapping.weightKg]) || 0.5);

      const rawCourier = String(row[mapping.courier] || '').trim();
      const courier: CourierName = this.normalizeCourier(rawCourier, defaultCourier);

      const rawPayment = String(row[mapping.paymentType] || '').trim().toUpperCase();
      const paymentType: PaymentType = rawPayment.includes('PREPAID') ? 'Prepaid' : defaultPaymentType;

      const rawCod = parseFloat(row[mapping.codAmount]);
      const codAmount = paymentType === 'COD' ? (isNaN(rawCod) ? 999 : rawCod) : 0;

      return {
        id: orderId,
        customer: {
          name: customerName,
          phone,
          addressLine,
          landmark,
          city,
          district,
          state,
          pinCode
        },
        item: {
          productName,
          sku,
          quantity,
          weightKg
        },
        courier,
        paymentType,
        codAmount,
        status: 'Pending',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    });
  }

  private static normalizeCourier(raw: string, fallback: CourierName): CourierName {
    const lower = raw.toLowerCase();
    if (lower.includes('delhivery')) return 'Delhivery';
    if (lower.includes('dtdc')) return 'DTDC';
    if (lower.includes('india post') || lower.includes('speed post')) return 'India Post';
    if (lower.includes('shiprocket')) return 'Shiprocket';
    if (lower.includes('nimbus')) return 'NimbusPost';
    if (lower.includes('bluedart')) return 'Bluedart';
    if (lower.includes('ekart')) return 'Ekart';
    return fallback;
  }
}

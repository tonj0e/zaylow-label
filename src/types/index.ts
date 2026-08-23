export type PaymentType = 'COD' | 'Prepaid';

export type CourierName = 
  | 'Delhivery' 
  | 'DTDC' 
  | 'India Post' 
  | 'Shiprocket' 
  | 'NimbusPost' 
  | 'Bluedart' 
  | 'Ekart' 
  | 'Custom';

export type OrderStatus = 'Pending' | 'Processing' | 'Label Generated' | 'Printed' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Claims' | 'Returned';

export interface CustomerAddress {
  name: string;
  phone: string;
  addressLine: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
}

export interface OrderItem {
  productName: string;
  sku: string;
  quantity: number;
  weightKg: number;
}

export interface Order {
  id: string; // Order ID (e.g. ZYL-98432)
  date: string; // Order date (e.g. 2024-01-01)
  customer: CustomerAddress;
  item: OrderItem;
  courier: CourierName;
  paymentType: PaymentType;
  codAmount: number;
  status: OrderStatus;
  createdAt: string;
  cartonId?: string;
  productId?: string;
  printedAt?: string;
  trackingNumber?: string;
  notes?: string;
  returnReason?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  claimDate?: string;
  claimReason?: string;
  claimStatus?: string;
}

export interface WarehouseAddress {
  companyName: string;
  contactPerson: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  pinCode: string;
  gstin?: string;
}

export interface CompanySettings {
  companyName: string;
  tagline: string;
  logoUrl: string;
  warehouse: WarehouseAddress;
  defaultCourier: CourierName;
  defaultPaymentType: PaymentType;
  paperSize: '100x150mm' | '100x100mm' | '4x6inch';
  dpi: 300 | 200;
  darkThermalPrintMode: boolean;
  autoMarkPrintedOnPrint: boolean;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  platform: 'WooCommerce' | 'Shopify' | 'Amazon' | 'Flipkart' | 'Meesho' | 'Shiprocket' | 'NimbusPost' | 'India Post' | 'DTDC' | 'Delhivery';
  logo: string;
  connected: boolean;
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  lastSync?: string;
  status: 'active' | 'inactive' | 'error';
}

export interface PrintQueueItem {
  id: string;
  order: Order;
  addedAt: string;
  status: 'queued' | 'printing' | 'completed' | 'failed';
  copies: number;
  error?: string;
}

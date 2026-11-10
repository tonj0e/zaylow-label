// COD bills imported from India Post's COD Bills Report, kept in this browser.
export interface CodBill {
  id: string;
  date: string;
  amount: number;
  status: 'Remitted' | 'Pending' | string;
  paidOn?: string;
}

export const COD_BILLS_KEY = 'zaylow_cod_bills';

export interface CodBillStore { importedAt: string; bills: CodBill[] }

export const readCodBills = (): CodBillStore | null => {
  try { const v = localStorage.getItem(COD_BILLS_KEY); return v ? (JSON.parse(v) as CodBillStore) : null; } catch { return null; }
};


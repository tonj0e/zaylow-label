import React, { useMemo, useState } from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import type { Order } from '../../types';
import type { CodBill } from '../../utils/codBillsStore';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Turns "10 Nov 2026", "10-11-2026", "2026-11-10" or an ISO time into YYYY-MM-DD. */
const toDayKey = (raw?: string): string => {
  const s = (raw || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\s/.-]+([a-z]{3})[a-z]*[\s/.,-]+(\d{4})/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(parseInt(m[1]))}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${pad(parseInt(m[2]))}-${pad(parseInt(m[1]))}`;
  return '';
};

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(Date.UTC(y, m - 1, d + n)));
};
const nice = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

type State = 'paid' | 'pending' | 'different' | 'expected';

interface Props { orders: Order[]; bills: CodBill[] | null }

/** COD money India Post will pay out, worked out from parcels marked Delivered: no India Post login needed. */
export const CodComingCard: React.FC<Props> = ({ orders, bills }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { days, unknownCount, unknownTotal } = useMemo(() => {
    const byDay = new Map<string, Order[]>();
    let unknownCount = 0;
    let unknownTotal = 0;
    orders.forEach((o) => {
      if (o.paymentType !== 'COD' || o.status !== 'Delivered' || !(o.codAmount > 0)) return;
      const k = toDayKey(o.deliveredAt);
      if (!k) { unknownCount += 1; unknownTotal += o.codAmount; return; }
      byDay.set(k, [...(byDay.get(k) || []), o]);
    });
    const billList = (bills || []).map((b) => ({ ...b, key: toDayKey(b.date) })).filter((b) => b.key);
    const used = new Set<string>();
    const days = [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        const total = list.reduce((n, o) => n + o.codAmount, 0);
        // India Post bills the day after delivery; allow for a weekend or holiday gap
        const near = billList.filter((b) => !used.has(b.id) && b.key > key && b.key <= addDays(key, 4));
        const exact = near.find((b) => Math.round(b.amount) === Math.round(total));
        const bill = exact || near.find((b) => b.key === addDays(key, 1));
        if (bill) used.add(bill.id);
        let state: State = 'expected';
        if (bill) state = exact ? (/remit/i.test(bill.status) ? 'paid' : 'pending') : 'different';
        return { key, list, total, bill, state };
      });
    return { days, unknownCount, unknownTotal };
  }, [orders, bills]);

  const coming = days.filter((d) => d.state !== 'paid').reduce((n, d) => n + d.total, 0);
  const shown = showAll ? days : days.slice(0, 7);
  const label: Record<State, string> = { paid: 'Paid to you', pending: 'Bill pending', different: 'Check the amount', expected: 'Not billed yet' };

  return (
    <section className="k-card p-5 k-rise" style={{ ['--i' as string]: 2 }} aria-label="COD money coming">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xl font-bold k-display flex items-center gap-2"><Wallet className="w-5 h-5 k-lime-text" /> COD money coming</h3>
          <p className="text-sm k-muted mt-1">Worked out from parcels marked Delivered. India Post pays each day's COD the next day, less about ₹6 to ₹7 per parcel.</p>
        </div>
        <div className="text-right">
          <p className="text-xs k-muted">Still to receive</p>
          <p className="text-3xl font-bold k-display">{inr(coming)}</p>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-sm k-muted mt-4">No COD parcel has a delivery day yet. Each delivery found by the daily check gets one.</p>
      ) : (
        <ul className="mt-4 rounded-2xl k-card2 overflow-hidden">
          {shown.map((d) => {
            const isOpen = open === d.key;
            return (
              <li key={d.key} className="border-t k-rule first:border-t-0">
                <button onClick={() => setOpen(isOpen ? null : d.key)} aria-expanded={isOpen} className="w-full grid grid-cols-[1fr_auto_auto] md:grid-cols-[6rem_1fr_auto_5rem_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
                  <span className="text-sm font-semibold md:order-1">{nice(d.key)}</span>
                  <span className="col-start-1 row-start-2 md:col-start-auto md:row-start-auto md:order-2 text-xs md:text-sm k-muted min-w-0">{d.list.length} parcel{d.list.length === 1 ? '' : 's'} delivered</span>
                  <span className="col-start-2 row-start-2 md:col-start-auto md:row-start-auto md:order-3 text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap justify-self-end" style={{ background: 'var(--card)' }}>{label[d.state]}</span>
                  <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto md:order-4 text-right text-sm font-bold">{inr(d.total)}</span>
                  <ChevronDown className="col-start-3 row-span-2 md:row-span-1 md:col-start-auto md:order-5 w-4 h-4 k-muted shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    {d.state === 'different' && d.bill && <p className="text-xs mb-2 k-warn">India Post's bill for {nice(d.bill.key)} is {inr(d.bill.amount)}, not {inr(d.total)}. Check the parcels below against the bill's articles.</p>}
                    <ul className="rounded-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                      {d.list.map((o) => (
                        <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm border-t k-rule first:border-t-0">
                          <span className="flex-1 min-w-0 truncate font-medium">{o.customer.name}</span>
                          <span className="font-mono text-xs k-muted hidden sm:block">{o.trackingNumber || o.id}</span>
                          <span className="w-16 text-right font-semibold">{inr(o.codAmount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
        <p className="text-xs k-muted">
          {unknownCount > 0 ? `${unknownCount.toLocaleString('en-IN')} older delivered COD parcels (${inr(unknownTotal)}) have no delivery day, so they are left out.` : ''}
        </p>
        {days.length > 7 && <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold underline">{showAll ? 'Show fewer days' : `Show all ${days.length} days`}</button>}
      </div>
    </section>
  );
};

import React from 'react';
import { User, Shield, ShieldCheck, Check, X, Flame, BarChart2, Feather } from 'lucide-react';
import { type CardSizeOption, CARD_DIMENSIONS } from '../../constants/warrantyCardSizes';

export interface WarrantyCardProps {
  customerName: string;
  purchaseDate: string;
  endDate?: string;
  warrantyPeriod?: string;
  productName?: string;
  orderId?: string;
  size?: CardSizeOption;
  scale?: number;
  productImage?: string;
  innerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export const WarrantyCard: React.FC<WarrantyCardProps> = ({
  customerName = 'Nashid',
  purchaseDate = '01/10/2026',
  endDate = '01/10/2027',
  warrantyPeriod,
  productName = 'Period Cramps Relief Massager',
  size = 'thermal',
  scale = 1,
  productImage = '/warranty-product-belt.png',
  innerRef,
  className = ''
}) => {
  const dim = CARD_DIMENSIONS[size] || CARD_DIMENSIONS.thermal;
  // Standard CSS mm-to-pixel ratio is 3.7795 px/mm
  // For 100mm x 150mm: 378px x 567px base size
  const widthPx = Math.round(dim.widthMm * 3.7795 * scale);
  const heightPx = Math.round(dim.heightMm * 3.7795 * scale);

  // Effective display text for the 3rd customer details row:
  // In the new official design, "Warranty Period" displays the expiration date (e.g. 01/10/2027)
  const displayWarrantyPeriod = warrantyPeriod || endDate || '01/10/2027';

  return (
    <div
      ref={innerRef}
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        boxSizing: 'border-box'
      }}
      className={`warranty-card-element bg-white text-black p-3.5 sm:p-4 flex flex-col justify-between rounded-2xl border-2 border-black/90 shadow-md select-none overflow-hidden font-sans relative ${className}`}
    >
      {/* ── 1. TOP HEADER: BRANDING ── */}
      <div className="flex items-center justify-between pb-1.5 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Geometric Zaylow pinwheel logo */}
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center p-1.5 shadow-xs shrink-0">
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
              <path d="M50 42 C50 42 50 25 38 18 C26 11 15 23 22 37 C29 51 45 49 50 42Z" fill="white" />
              <path d="M58 50 C58 50 75 50 82 38 C89 26 77 15 63 22 C49 29 51 45 58 50Z" fill="white" />
              <path d="M50 58 C50 58 50 75 62 82 C74 89 85 77 78 63 C71 49 55 51 50 58Z" fill="white" />
              <path d="M42 50 C42 50 25 50 18 62 C11 74 23 85 37 78 C51 71 49 55 42 50Z" fill="white" />
            </svg>
          </div>
          <div>
            <h1 className="font-black text-[19px] tracking-[4px] uppercase text-black leading-none font-sans">
              ZAYLOW
            </h1>
            <p className="text-[7.5px] font-bold tracking-[1.5px] uppercase text-slate-700 leading-none mt-1">
              Comfort For A Better You
            </p>
          </div>
        </div>

        {/* Right Slogan with black underline */}
        <div className="text-right shrink-0">
          <p className="font-extrabold text-[8px] uppercase tracking-[2px] text-black leading-tight">
            Your
          </p>
          <p className="font-extrabold text-[8px] uppercase tracking-[2px] text-black leading-tight">
            Comfort
          </p>
          <p className="font-extrabold text-[8px] uppercase tracking-[2px] text-black leading-tight">
            Our Care
          </p>
          <div className="w-8 h-0.5 bg-black ml-auto mt-0.5" />
        </div>
      </div>

      {/* ── 2. HERO SECTION: 1 YEAR WARRANTY CARD + MASSAGER IMAGE ── */}
      <div className="grid grid-cols-12 gap-2 items-center my-0.5">
        {/* Left: 1 YEAR WARRANTY CARD & Product Pill */}
        <div className="col-span-6 flex flex-col justify-center">
          <h2 className="text-[38px] font-black tracking-tighter text-black leading-none">
            1 YEAR
          </h2>
          <h3 className="text-[13.5px] font-black tracking-wider uppercase text-black leading-tight mt-0.5">
            WARRANTY CARD
          </h3>
          <div className="mt-1.5 inline-block">
            <span className="bg-black text-white text-[8.5px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs tracking-wide inline-block truncate max-w-full">
              {productName}
            </span>
          </div>
        </div>

        {/* Right: Massager Product Image */}
        <div className="col-span-6 flex items-center justify-center relative">
          <div className="w-full h-[76px] flex items-center justify-center">
            <img
              src={productImage}
              alt={productName}
              crossOrigin="anonymous"
              className="max-h-full max-w-full object-contain filter drop-shadow-sm"
              onError={(e) => {
                // Fallback to alt image or product belt if path fails
                const target = e.currentTarget;
                if (!target.src.includes('warranty-product-belt.png')) {
                  target.src = '/warranty-product-belt.png';
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 3. FEATURES ROW: 4 COLUMNS WITH VERTICAL DIVIDERS ── */}
      <div className="grid grid-cols-4 divide-x divide-slate-300 border-t border-b border-slate-300 py-1.5 my-1 text-center">
        {/* 1. Heat Therapy */}
        <div className="px-1 flex flex-col items-center justify-center">
          <Flame className="w-4 h-4 text-black mb-0.5" />
          <p className="font-bold text-[8.5px] text-black leading-tight">Smooth</p>
          <p className="font-bold text-[8.5px] text-black leading-tight">Heat Therapy</p>
          <p className="text-[6.5px] text-slate-600 leading-tight mt-0.5 font-medium">3 Heating Modes</p>
        </div>

        {/* 2. Massage Modes */}
        <div className="px-1 flex flex-col items-center justify-center">
          <BarChart2 className="w-4 h-4 text-black mb-0.5" />
          <p className="font-bold text-[8.5px] text-black leading-tight">Massage Modes</p>
          <p className="text-[6.5px] text-slate-600 leading-tight mt-0.5 font-medium">4 Massage Modes</p>
        </div>

        {/* 3. Safe & Reliable */}
        <div className="px-1 flex flex-col items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-black mb-0.5" />
          <p className="font-bold text-[8.5px] text-black leading-tight">Safe &</p>
          <p className="font-bold text-[8.5px] text-black leading-tight">Reliable</p>
        </div>

        {/* 4. Lightweight & Portable */}
        <div className="px-1 flex flex-col items-center justify-center">
          <Feather className="w-4 h-4 text-black mb-0.5" />
          <p className="font-bold text-[8.5px] text-black leading-tight">Lightweight</p>
          <p className="font-bold text-[8.5px] text-black leading-tight">& Portable</p>
        </div>
      </div>

      {/* ── 4. CUSTOMER DETAILS BOX ── */}
      <div className="border border-black rounded-xl overflow-hidden my-1">
        {/* Black Header Banner */}
        <div className="bg-black text-white px-2.5 py-1 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 shrink-0" />
          <span className="font-black text-[9.5px] uppercase tracking-wider">Customer Details</span>
        </div>

        {/* Rows with light gray pills */}
        <div className="p-2 space-y-1 bg-white text-[10px]">
          <div className="flex items-center">
            <span className="font-bold text-black w-28 shrink-0">Customer Name</span>
            <span className="font-bold text-black mr-2">:</span>
            <div className="flex-1 bg-slate-100 rounded px-2.5 py-0.5 font-bold text-black truncate">
              {customerName}
            </div>
          </div>

          <div className="flex items-center">
            <span className="font-bold text-black w-28 shrink-0">Purchase Date</span>
            <span className="font-bold text-black mr-2">:</span>
            <div className="flex-1 bg-slate-100 rounded px-2.5 py-0.5 font-bold text-black font-mono truncate">
              {purchaseDate}
            </div>
          </div>

          <div className="flex items-center">
            <span className="font-bold text-black w-28 shrink-0">Warranty Period</span>
            <span className="font-bold text-black mr-2">:</span>
            <div className="flex-1 bg-slate-100 rounded px-2.5 py-0.5 font-bold text-black font-mono truncate">
              {displayWarrantyPeriod}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. WARRANTY COVERS BOX ── */}
      <div className="border border-black rounded-xl overflow-hidden my-1">
        {/* Black Header Banner */}
        <div className="bg-black text-white px-2.5 py-1 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span className="font-black text-[9.5px] uppercase tracking-wider">Warranty Covers</span>
        </div>

        {/* Items */}
        <div className="p-2 space-y-1 bg-white text-[9.5px]">
          <div className="flex items-start gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="font-bold text-black leading-tight">Manufacturer defects</span>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="font-bold text-black leading-tight">
              Functional issues <span className="font-normal text-slate-600">(not working, charging problem, etc.)</span>
            </span>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="font-bold text-black leading-tight">Replacement or repair within 1 year</span>
          </div>
        </div>
      </div>

      {/* ── 6. WARRANTY DOES NOT COVER BOX ── */}
      <div className="border border-black rounded-xl overflow-hidden my-1">
        {/* Black Header Banner */}
        <div className="bg-black text-white px-2.5 py-1 flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center shrink-0">
            <X className="w-2.5 h-2.5 stroke-[3] text-white" />
          </div>
          <span className="font-black text-[9.5px] uppercase tracking-wider">Warranty Does Not Cover</span>
        </div>

        {/* Items */}
        <div className="p-2 space-y-1 bg-white text-[9.5px]">
          <div className="flex items-start gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
              <X className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="font-bold text-black leading-tight">
              Physical damage <span className="font-normal text-slate-600">(drop, impact, etc.)</span>
            </span>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
              <X className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="font-bold text-black leading-tight">
              Water damage <span className="font-normal text-slate-600">(liquid, moisture exposure)</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── 7. FOOTER: THANK YOU & SLOGAN ── */}
      <div className="pt-1 mt-0.5">
        {/* Divider with centered heart */}
        <div className="relative flex items-center justify-center mb-1.5">
          <div className="w-full border-t border-black"></div>
          <span className="absolute bg-white px-1.5 text-black text-xs font-light">♡</span>
        </div>

        <div className="flex items-center justify-between text-black px-1">
          {/* Cursive Thank You */}
          <div className="leading-tight">
            <p
              className="text-black text-[26px] font-normal leading-none"
              style={{ fontFamily: "'Dancing Script', 'Alex Brush', cursive" }}
            >
              Thank you
            </p>
          </div>

          {/* Vertical Divider */}
          <div className="w-px h-7 bg-black mx-2" />

          {/* Right Slogan */}
          <div className="text-[7.5px] font-bold text-black leading-tight tracking-wider uppercase text-right">
            <p>FOR CHOOSING ZAYLOW</p>
            <p className="font-extrabold mt-0.5">STAY COMFORTABLE ALWAYS</p>
            <div className="w-8 h-0.5 bg-black ml-auto mt-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
};

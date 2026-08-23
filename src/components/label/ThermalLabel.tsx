import React from 'react';
import type { Order, CompanySettings } from '../../types';
import { QRCodeComponent } from './QRCodeComponent';
import { numberToWords } from '../../utils/numberToWords';
import type { LabelSize } from '../../constants/labelSizes';
import { DEFAULT_LABEL_SIZE, mmToPx } from '../../constants/labelSizes';

interface ThermalLabelProps {
  order: Order;
  settings: CompanySettings;
  labelSize?: LabelSize;
  scale?: number;
  innerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export const ThermalLabel: React.FC<ThermalLabelProps> = ({
  order,
  settings,
  labelSize = DEFAULT_LABEL_SIZE,
  scale = 1,
  innerRef,
  className = ''
}) => {
  const isCod = order.paymentType === 'COD';

  // Compute pixel dimensions from mm
  const baseW = mmToPx(labelSize.widthMm);
  const baseH = mmToPx(labelSize.heightMm);
  // Determine if this is a small label (< 60mm wide or < 80mm tall)
  const isSmall = labelSize.widthMm < 70 || labelSize.heightMm < 80;

  const fromAddress = isCod
    ? {
        name: 'JOSHWA M JOLLY',
        address: 'MUNDACKAL (H) VALAMANGALAM NORTH THURAVOOR PO CHERTHALA',
        pin: '688532',
        phone: '6282010344'
      }
    : {
        name: 'ZAYLOW',
        address: 'GOLD MAREN SEE FOODS THURAVOOR PO CHERTHALA',
        pin: '688532',
        phone: '6282010344'
      };

  // QR Code Payload contains essential tracking info
  const qrPayload = JSON.stringify({
    id: order.id,
    c: order.customer.name,
    p: order.customer.pinCode,
    ph: order.customer.phone,
    courier: order.courier,
    pay: order.paymentType,
    cod: order.codAmount
  });

  if (isCod) {
    return (
      <div
        ref={innerRef}
        style={{
          width: `${baseW * scale}px`,
          height: `${baseH * scale}px`,
          boxSizing: 'border-box'
        }}
        className={`thermal-label-element bg-white text-black font-sans select-none overflow-hidden border-4 border-black flex flex-col leading-tight ${isSmall ? 'text-[9px]' : ''} ${className}`}
      >
        {/* 1. TOP HEADER: BRANDING & COD BANNER */}
        <div className="border-b-4 border-black pb-2 pt-2 flex flex-col items-center justify-center text-center bg-white min-h-[75px] relative">
          {/* Customer ID box - inline top-left, not absolute */}
          <div className="absolute top-2 left-2 border-2 border-black px-2 pt-1 pb-2 z-10 bg-white">
            <p className="font-bold text-[8px] uppercase leading-none mb-0.5">CUSTOMER ID:</p>
            <p className="font-black text-[13px] leading-tight">1106988832</p>
          </div>
          
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="h-[38px] w-[38px] object-contain mb-1"
            />
          )}
          <h1 className="font-black text-[20px] tracking-[5px] uppercase leading-none mb-0.5">
            {settings.companyName || 'ZAYLOW'}
          </h1>
          <div className="mt-1 w-full px-4">
            <h2 className="font-black text-[16px] tracking-wide uppercase m-0 leading-none">COD: ₹{order.codAmount}</h2>
            <p className="text-[9px] font-bold mt-0.5">(Rupees {numberToWords(order.codAmount)} Only)</p>
          </div>
        </div>

        {/* 2. ADDRESS ROW (FULL WIDTH) */}
        <div className="flex border-b-4 border-black flex-col p-3 flex-1 min-h-[140px]">
          <span className="font-bold text-[12px] uppercase mb-1">TO:</span>
          <h2 className="font-black text-[19px] uppercase leading-none mb-1 tracking-tight flex-shrink-0">
            {order.customer.name}
          </h2>
          <div className="text-[11px] font-bold leading-tight uppercase text-black break-words whitespace-normal">
            <p>{order.customer.addressLine}</p>
            <p>{order.customer.city}{order.customer.district && order.customer.district.trim().toLowerCase() !== order.customer.city.trim().toLowerCase() && `, ${order.customer.district}`}, {order.customer.state}</p>
            {order.customer.landmark && <p>LDMK: {order.customer.landmark}</p>}
            <p>PIN: {order.customer.pinCode}</p>
            {order.customer.phone && <p>PHONE: {order.customer.phone}</p>}
          </div>
        </div>

        {/* 3. FROM ADDRESS & QR CODE ROW */}
        <div className="flex border-b-4 border-black h-[170px]">
          {/* Left Side: FROM Address */}
          <div className="w-[55%] border-r-4 border-black p-3 flex flex-col">
            <span className="font-bold text-[11px] uppercase mb-1">FROM:</span>
            <h3 className="font-black text-[15px] uppercase mb-1 tracking-tight leading-none">{fromAddress.name}</h3>
            <div className="text-[10px] font-bold leading-tight pr-2 uppercase">
              <p>{fromAddress.address}</p>
              <p className="mt-1">PIN: {fromAddress.pin}</p>
              <p>PHONE: {fromAddress.phone}</p>
            </div>
          </div>

          {/* Right Side: QR Code & Order ID */}
          <div className="w-[45%] p-2 flex flex-col items-center justify-center text-center">
            <QRCodeComponent value={qrPayload} size={85} />
            <div className="mt-1 w-full">
              <span className="font-bold text-[10px] uppercase text-left block w-full pl-1 mb-0.5">ORDER ID:</span>
              <span className="font-black text-[20px] tracking-wide uppercase block w-full text-center leading-none">
                #{order.id.replace('ZYL-', '')}
              </span>
            </div>
          </div>
        </div>

        {/* 4. PRODUCT DETAILS & FRAGILE ROW */}
        <div className="flex flex-1 min-h-[120px]">
          {/* Left Side: Product Details */}
          <div className="w-[55%] border-r-4 border-black p-2 flex flex-col">
            <span className="font-bold text-[10px] uppercase mb-1">PRODUCT DETAILS:</span>
            <div className="text-[9px] font-medium leading-[1.4] uppercase">
              <p className="whitespace-normal leading-tight mb-1 font-bold">PRODUCT NAME: {order.item.productName}</p>
              <p>QUANTITY: {order.item.quantity}</p>
              <p>PRICE: ₹{order.codAmount}</p>
              <p>ORDER ID: #{order.id.replace('ZYL-', '')}</p>
              {order.productId && <p>PRODUCT ID: {order.productId}</p>}
              {order.cartonId && <p>CARTON ID: {order.cartonId}</p>}
            </div>
          </div>

          {/* Right Side: Fragile block */}
          <div className="w-[45%] p-3 flex items-center justify-start gap-3">
            <div className="border-[3px] border-black p-2 flex-shrink-0 w-[46px] h-[52px] flex items-center justify-center">
              <svg width="28" height="34" viewBox="0 0 24 32" fill="black">
                <path d="M1 2 L23 2 L21 16 C20.5 19.5 17 22 13 22 L13 29 L18 29 L18 31 L6 31 L6 29 L11 29 L11 22 C7 22 3.5 19.5 3 16 Z"/>
                <path fill="white" stroke="white" strokeWidth="1" d="M12 2 L9 8 L14 11 L10 16 L12 18 L16 11 L11 7 Z"/>
              </svg>
            </div>
            <div className="flex flex-col justify-center mt-1">
              <h3 className="font-black text-[17px] tracking-wide uppercase mb-0.5 leading-none">FRAGILE</h3>
              <p className="text-[10px] font-medium leading-[1.2]">Handle with Care.<br/>Keep Away from Moisture.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={innerRef}
      style={{
        width: `${baseW * scale}px`,
        height: `${baseH * scale}px`,
        boxSizing: 'border-box'
      }}
      className={`thermal-label-element bg-white text-black font-sans select-none overflow-hidden border-4 border-black flex flex-col leading-tight ${isSmall ? 'text-[9px]' : ''} ${className}`}
    >
      {/* 1. TOP HEADER: BRANDING (NO COD for Prepaid) */}
      <div className="border-b-4 border-black pb-2 pt-2 flex flex-col items-center justify-center text-center bg-white min-h-[75px] relative">
        {/* Customer ID box in top-left */}
        <div className="absolute top-2 left-2 border-2 border-black px-2 pt-1 pb-2 z-10 bg-white">
          <p className="font-bold text-[8px] uppercase leading-none mb-0.5">CUSTOMER ID:</p>
          <p className="font-black text-[13px] leading-tight">1106988832</p>
        </div>

        {settings.logoUrl && (
          <img
            src={settings.logoUrl}
            alt="Logo"
            className="h-[38px] w-[38px] object-contain mb-1"
          />
        )}
        <h1 className="font-black text-[20px] tracking-[5px] uppercase leading-none">
          {settings.companyName || 'ZAYLOW'}
        </h1>
      </div>

      {/* 2. TO ADDRESS ROW (FULL WIDTH) */}
      <div className="flex border-b-4 border-black flex-col p-3 flex-1 min-h-[140px]">
        <span className="font-bold text-[12px] uppercase mb-1">TO:</span>
        <h2 className="font-black text-[19px] uppercase leading-none mb-1 tracking-tight flex-shrink-0">
          {order.customer.name}
        </h2>
        <div className="text-[11px] font-bold leading-tight uppercase text-black break-words whitespace-normal">
          <p>{order.customer.addressLine}</p>
          <p>{order.customer.city}{order.customer.district && order.customer.district.trim().toLowerCase() !== order.customer.city.trim().toLowerCase() && `, ${order.customer.district}`}, {order.customer.state}</p>
          {order.customer.landmark && <p>LDMK: {order.customer.landmark}</p>}
          <p>PIN: {order.customer.pinCode}</p>
          {order.customer.phone && <p>PHONE: {order.customer.phone}</p>}
        </div>
      </div>

      {/* 3. FROM ADDRESS & QR CODE ROW */}
      <div className="flex border-b-4 border-black h-[170px]">
        {/* Left Side: FROM Address */}
        <div className="w-[55%] border-r-4 border-black p-3 flex flex-col">
          <span className="font-bold text-[11px] uppercase mb-1">FROM:</span>
          <h3 className="font-black text-[15px] uppercase mb-1 tracking-tight leading-none">{fromAddress.name}</h3>
          <div className="text-[10px] font-bold leading-tight pr-2 uppercase">
            <p>{fromAddress.address}</p>
            <p className="mt-1">PIN: {fromAddress.pin}</p>
            <p>PHONE: {fromAddress.phone}</p>
          </div>
        </div>

        {/* Right Side: QR Code & Order ID */}
        <div className="w-[45%] p-2 flex flex-col items-center justify-center text-center">
          <QRCodeComponent value={qrPayload} size={85} />
          <div className="mt-1 w-full">
            <span className="font-bold text-[10px] uppercase text-left block w-full pl-1 mb-0.5">ORDER ID:</span>
            <span className="font-black text-[20px] tracking-wide uppercase block w-full text-center leading-none">
              #{order.id.replace('ZYL-', '')}
            </span>
          </div>
        </div>
      </div>

      {/* 4. PRODUCT DETAILS & FRAGILE ROW */}
      <div className="flex flex-1 min-h-[120px]">
        {/* Left Side: Product Details */}
        <div className="w-[55%] border-r-4 border-black p-2 flex flex-col">
          <span className="font-bold text-[10px] uppercase mb-1">PRODUCT DETAILS:</span>
          <div className="text-[9px] font-medium leading-[1.4] uppercase">
            <p className="whitespace-normal leading-tight mb-1 font-bold">PRODUCT NAME: {order.item.productName}</p>
            <p>QUANTITY: {order.item.quantity}</p>
            <p>PRICE: ₹{order.codAmount > 0 ? order.codAmount : ''}</p>
            <p>ORDER ID: #{order.id.replace('ZYL-', '')}</p>
            {order.productId && <p>PRODUCT ID: {order.productId}</p>}
            {order.cartonId && <p>CARTON ID: {order.cartonId}</p>}
          </div>
        </div>

        {/* Right Side: Fragile block */}
        <div className="w-[45%] p-3 flex items-center justify-start gap-3">
          <div className="border-[3px] border-black p-2 flex-shrink-0 w-[46px] h-[52px] flex items-center justify-center">
            <svg width="28" height="34" viewBox="0 0 24 32" fill="black">
              <path d="M1 2 L23 2 L21 16 C20.5 19.5 17 22 13 22 L13 29 L18 29 L18 31 L6 31 L6 29 L11 29 L11 22 C7 22 3.5 19.5 3 16 Z"/>
              <path fill="white" stroke="white" strokeWidth="1" d="M12 2 L9 8 L14 11 L10 16 L12 18 L16 11 L11 7 Z"/>
            </svg>
          </div>
          <div className="flex flex-col justify-center mt-1">
            <h3 className="font-black text-[17px] tracking-wide uppercase mb-0.5 leading-none">FRAGILE</h3>
            <p className="text-[10px] font-medium leading-[1.2]">Handle with Care.<br/>Keep Away from Moisture.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

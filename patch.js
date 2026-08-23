const fs = require('fs');
const file = '/Users/joshwamjolly/Downloads/LABEL/src/components/label/ThermalLabel.tsx';
let content = fs.readFileSync(file, 'utf8');

const returnRegex = /return \([\s\S]*?\);\n\};/;
const match = content.match(returnRegex);

if (!match) {
  console.error("Could not find return statement");
  process.exit(1);
}

const originalReturn = match[0];
const strippedReturn = originalReturn.replace(/return \(/, '').replace(/\);\n\};$/, '');

const newReturn = `
  if (isCod) {
    return (
      <div
        ref={innerRef}
        style={{
          width: \`\${baseW * scale}px\`,
          height: \`\${baseH * scale}px\`,
          boxSizing: 'border-box'
        }}
        className={\`thermal-label-element bg-white text-black font-sans select-none overflow-hidden border-4 border-black flex flex-col leading-tight \${isSmall ? 'text-[9px]' : ''} \${className}\`}
      >
        {/* 1. TOP HEADER: BRANDING & COD BANNER */}
        <div className="border-b-4 border-black pb-3 pt-4 flex flex-col items-center justify-center text-center bg-white min-h-[90px]">
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="h-[44px] w-[44px] object-contain mb-1"
            />
          )}
          <h1 className="font-black text-[22px] tracking-[6px] uppercase leading-none mb-0.5">
            {settings.companyName || 'ZAYLOW'}
          </h1>
          <div className="mt-1.5 w-full px-4">
            <h2 className="font-black text-[18px] tracking-wide uppercase m-0 leading-none">VVP: ₹{order.codAmount}</h2>
            <p className="text-[10px] font-bold mt-0.5">(Rupees {numberToWords(order.codAmount)} Only)</p>
          </div>
        </div>

        {/* 2. ADDRESS ROW (FULL WIDTH) */}
        <div className="flex border-b-4 border-black flex-col p-4 flex-1 min-h-[160px]">
          <span className="font-bold text-[14px] uppercase mb-3">TO:</span>
          <h2 className="font-black text-[24px] uppercase leading-none mb-3 tracking-tight">
            {order.customer.name}
          </h2>
          <div className="text-[14px] font-bold leading-[1.5] uppercase text-black">
            <p>{order.customer.addressLine}</p>
            <p>{order.customer.city}{order.customer.district && \`, \${order.customer.district}\`}, {order.customer.state}</p>
            {order.customer.landmark && <p>LADR: {order.customer.landmark}</p>}
            <p>PIN: {order.customer.pinCode}</p>
            {order.customer.phone && <p>PHONE: {order.customer.phone}</p>}
          </div>
        </div>

        {/* 3. FROM ADDRESS & QR CODE ROW */}
        <div className="flex border-b-4 border-black h-[180px]">
          {/* Left Side: FROM Address */}
          <div className="w-[55%] border-r-4 border-black p-4 flex flex-col">
            <span className="font-bold text-[12px] uppercase mb-3">FROM:</span>
            <h3 className="font-black text-[18px] uppercase mb-3 tracking-tight leading-none">{fromAddress.name}</h3>
            <div className="text-[13px] font-medium leading-[1.5] pr-2 uppercase">
              <p>{fromAddress.address}</p>
              <p className="mt-2">PIN: {fromAddress.pin}</p>
              <p>PHONE: {fromAddress.phone}</p>
            </div>
          </div>

          {/* Right Side: QR Code & Order ID */}
          <div className="w-[45%] p-4 flex flex-col items-center justify-center text-center">
            <QRCodeComponent value={qrPayload} size={115} />
            <div className="mt-3 w-full">
              <span className="font-bold text-[11px] uppercase text-left block w-full pl-2 mb-1">ORDER ID:</span>
              <span className="font-black text-[22px] tracking-wide uppercase block w-full text-center">
                #{order.id.replace('ZYL-', '')}
              </span>
            </div>
          </div>
        </div>

        {/* 4. PRODUCT DETAILS & FRAGILE ROW */}
        <div className="flex h-[110px]">
          {/* Left Side: Product Details */}
          <div className="w-[55%] border-r-4 border-black p-3 flex flex-col">
            <span className="font-bold text-[11px] uppercase mb-2">PRODUCT DETAILS:</span>
            <div className="text-[11px] font-medium leading-[1.6] uppercase">
              <p className="line-clamp-1 leading-tight mb-1">PRODUCT NAME: {order.item.productName}</p>
              <p>QUANTITY: {order.item.quantity}</p>
              <p>PRICE: ₹{order.codAmount}</p>
              <p>WEIGHT: {order.item.weightKg >= 1 ? \`\${order.item.weightKg}KG\` : \`\${order.item.weightKg * 1000}GM\`}</p>
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

  // Prepaid layout (Existing layout)
  return (${strippedReturn});
};
`;

content = content.replace(returnRegex, newReturn);
fs.writeFileSync(file, content);
console.log("Successfully updated ThermalLabel.tsx");

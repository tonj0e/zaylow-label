// Clean and extract standard India Post or carrier tracking number
export const parseTrackingCode = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();

  // If tracking link (e.g. myspeedpost.com/track?n=CL575897302IN or indiapost.gov.in)
  if (trimmed.includes('?n=') || trimmed.includes('&n=')) {
    const match = trimmed.match(/[?&]n=([A-Za-z0-9]+)/);
    if (match && match[1]) return match[1].toUpperCase();
  }

  // Standard India Post Article ID pattern: 2 letters, 9 digits, 2 letters (e.g. CL575897302IN, EE123456789IN)
  const ipMatch = trimmed.match(/[A-Za-z]{2}\d{9}[A-Za-z]{2}/);
  if (ipMatch) {
    return ipMatch[0].toUpperCase();
  }

  // Otherwise return alphanumeric cleaned code
  return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

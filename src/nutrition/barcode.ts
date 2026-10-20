// GTIN helpers for food barcodes (EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14).

export function gtinChecksumOk(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let total = 0;
  digits.reverse().forEach((d, i) => (total += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (total % 10)) % 10 === check;
}

/** Expand an 8-digit UPC-E code to its 12-digit UPC-A form. */
export function upcEToUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const n = upce[0]!;
  const d = upce.slice(1, 7);
  const check = upce[7]!;
  const last = d[5]!;
  let body: string;
  if ("012".includes(last)) body = d.slice(0, 2) + last + "0000" + d.slice(2, 5);
  else if (last === "3") body = d.slice(0, 3) + "00000" + d.slice(3, 5);
  else if (last === "4") body = d.slice(0, 4) + "00000" + d[4];
  else body = d.slice(0, 5) + "0000" + last;
  return n + body + check;
}

/**
 * Normalise a scanned or typed code. Returns the canonical code to look up, or null if it can't be a
 * valid product barcode. Open Food Facts stores UPC-A codes as 13 digits with a leading zero.
 */
export function normalizeBarcode(raw: string, format?: string): string | null {
  const code = raw.replace(/\D/g, "");
  if (format === "UPC_E" || (code.length === 8 && !gtinChecksumOk(code))) {
    const a = upcEToUpcA(code);
    if (a && gtinChecksumOk(a)) return "0" + a;
  }
  if (!gtinChecksumOk(code)) return null;
  if (code.length === 12) return "0" + code;
  if (code.length === 14 && code.startsWith("0")) return code.slice(1);
  return code;
}

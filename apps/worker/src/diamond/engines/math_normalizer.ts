// apps/worker/src/diamond/engines/math_normalizer.ts
//บทบาท: เครื่องยนต์หลักที่ใช้จัดการกับข้อมูลดิบจาก OCR เพื่อแปลงเป็นค่ามาตรฐานทางคณิตศาสตร์ รองรับทั้งเลขไทย เศษส่วน และนโยบายความคลาดเคลื่อน (Tolerance)
// apps/worker/src/diamond/engines/math_normalizer.ts

export type NumberFormatPolicy = 'thousands_comma' | 'decimal_comma';

export type ToleranceConfig = {
  abs_tol: number; // absolute tolerance (e.g., 0.001)
  rel_tol: number; // relative tolerance (e.g., 1e-6)
  policy?: NumberFormatPolicy; // optional number format policy
};

export class MathNormalizer {
  /**
   * Normalize:
   * - trim
   * - normalize unicode minus to '-'
   * - apply comma/decimal policy
   * - Thai digits -> Arabic digits
   * - simple fraction "a/b" -> decimal
   * - remove all remaining spaces
   */
  static normalize(raw: string, policy: NumberFormatPolicy = 'thousands_comma'): string {
    if (!raw) return '';

    // 1) normalize minus and trim
    let text = raw.trim().replace(/[\u2212\u2013\u2014]/g, '-');

    // 2) apply number formatting policy
    if (policy === 'thousands_comma') {
      // 1,234.56 -> 1234.56
      text = text.replace(/,/g, '');
    } else {
      // decimal_comma: 1.234,56 -> 1234.56
      // remove thousands '.' then replace ',' with '.'
      text = text.replace(/\./g, '').replace(/,/g, '.');
    }

    // 3) Thai digits -> Arabic digits
    // Thai digits: ๐(2406) .. ๙(2415)
    text = text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 2406));

    // 4) simple fraction a/b
    const fractionRegex = /^-?\s*(\d+)\s*\/\s*(\d+)\s*$/;
    const m = text.match(fractionRegex);
    if (m) {
      const num = Number(m[1]);
      const den = Number(m[2]);
      if (den === 0) return 'NaN';
      return String(num / den);
    }

    // 5) remove remaining spaces
    return text.replace(/\s+/g, '');
  }

  /**
   * Equivalent:
   * numeric compare with abs + rel tolerance
   * - normalizes BOTH student and expected using SAME policy
   * - fallback: normalized string equality
   */
  static isEquivalent(studentRaw: string, expectedRaw: string, cfg: ToleranceConfig): boolean {
    const policy: NumberFormatPolicy = cfg.policy ?? 'thousands_comma';

    const sNorm = this.normalize(studentRaw, policy);
    const eNorm = this.normalize(expectedRaw, policy);

    const sVal = parseFloat(sNorm);
    const eVal = parseFloat(eNorm);

    // numeric parse failed -> compare normalized strings
    if (Number.isNaN(sVal) || Number.isNaN(eVal)) {
      return sNorm === eNorm;
    }

    const absDiff = Math.abs(sVal - eVal);

    // 1) absolute tolerance
    if (absDiff <= cfg.abs_tol) return true;

    // 2) relative tolerance (avoid divide by zero)
    if (eVal !== 0) {
      const relDiff = absDiff / Math.abs(eVal);
      if (relDiff <= cfg.rel_tol) return true;
    }

    return false;
  }
}
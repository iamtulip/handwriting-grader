export class MathNormalizer {
  /**
   * แปลงค่าจาก OCR ให้เป็นมาตรฐาน (เช่น "1/2" -> "0.5", "๑,๐๐๐" -> "1000")
   */
  static normalize(raw: string): string {
    let text = raw.replace(/,/g, ''); // ลบ Comma
    text = text.replace(/[๐-๙]/g, d => (d.charCodeAt(0) - 2406).toString()); // แปลงเลขไทย
    
    // จัดการเศษส่วนพื้นฐาน (Simple Fraction Support)
    if (text.includes('/')) {
      const [num, den] = text.split('/').map(Number);
      if (den !== 0) return (num / den).toString();
    }
    
    return text.trim();
  }

  /**
   * ตรวจสอบความเท่ากันด้วย Absolute และ Relative Tolerance
   */
  static isEquivalent(student: string, expected: string, config: { abs_tol: number, rel_tol: number }): boolean {
    const s = parseFloat(this.normalize(student));
    const e = parseFloat(expected);

    if (isNaN(s) || isNaN(e)) return student.trim() === expected.trim();

    const absDiff = Math.abs(s - e);
    
    // Absolute Tolerance Check
    if (absDiff <= config.abs_tol) return true;

    // Relative Tolerance Check (เลี่ยงหารด้วยศูนย์)
    if (e !== 0) {
      const relDiff = absDiff / Math.abs(e);
      if (relDiff <= config.rel_tol) return true;
    }

    return false;
  }
}
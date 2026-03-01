// ฟังก์ชันคำนวณความเท่ากันทางคณิตศาสตร์ (Equivalence)
export function checkEquivalence(studentVal: string, expectedVal: string, tolerance: number): boolean {
  const s = parseFloat(studentVal);
  const e = parseFloat(expectedVal);
  
  if (isNaN(s) || isNaN(e)) return false;

  // 1. Exact Match
  if (s === e) return true;

  // 2. Tolerance Match ( margin of error )
  const diff = Math.abs(s - e);
  if (diff <= (e * tolerance)) return true;

  // 3. Symbolic / Rational Match (เช่น 1/2 == 0.5)
  // สามารถต่อยอดโดยใช้ไลบรารี mathjs หรือส่งเข้า Micro-service SymPy (Python)
  
  return false;
}
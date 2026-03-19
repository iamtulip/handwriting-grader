// apps/api/src/services/scoringEngine.ts
//The Meta-Scoring Engine (Backend Logic)
export type Policy = {
  total_points: number;
  w_attendance: number;
  w_submit_in_class: number;
  w_submit_same_day: number;
  w_submit_by_friday: number;
  w_accuracy: number;
  is_online_class: boolean;
};

export type StudentFact = {
  is_blank: boolean;
  ai_percentage: number; // 0..100
  submitted_at: Date;
  attendance_on_time: boolean | null; // null = ไม่มีข้อมูลเช็คชื่อ
};

export type Windows = {
  class_ends_at: Date;
  end_of_day: Date;
  end_of_friday: Date; // สามารถดึงมาจาก assignment.end_of_friday_at ได้เลย
};

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

export function calcWeeklyMetaScore(policy: Policy, fact: StudentFact, win: Windows) {
  // 1. blank => 0 ทันที
  if (fact.is_blank) {
    return { attendance: 0, punctuality: 0, accuracy: 0, total: 0 };
  }

  // 2. Attendance
  let attendance = 0;
  if (!policy.is_online_class && policy.w_attendance > 0) {
    attendance = fact.attendance_on_time ? policy.w_attendance : 0;
  }

  // 3. Punctuality (submission timing)
  const t = fact.submitted_at.getTime();
  let punctuality = 0;
  
  if (t <= win.class_ends_at.getTime()) {
    punctuality = policy.w_submit_in_class;
  } else if (t <= win.end_of_day.getTime()) {
    punctuality = policy.w_submit_same_day;
  } else if (t <= win.end_of_friday.getTime()) {
    punctuality = policy.w_submit_by_friday;
  } else {
    punctuality = 0;
  }

  // 4. Accuracy (step ladder อิงตาม weight ที่อาจารย์ตั้ง)
  const p = Math.max(0, Math.min(100, fact.ai_percentage));
  const base = policy.w_accuracy;

  let accuracy = 0;
  if (p >= 80) accuracy = base;
  else if (p >= 70) accuracy = Math.max(0, base - 0.2);
  else if (p >= 60) accuracy = Math.max(0, base - 0.4);
  else if (p >= 50) accuracy = Math.max(0, base - 0.6);
  else accuracy = Math.max(0, base - 0.8);

  const total = attendance + punctuality + accuracy;
  
  return {
    attendance: round2(attendance),
    punctuality: round2(punctuality),
    accuracy: round2(accuracy),
    total: round2(total),
  };
}
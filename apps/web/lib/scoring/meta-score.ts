export type MetaScoreInput = {
  assignmentType: string | null
  isOnlineClass: boolean
  weights: {
    attendance: number
    submitInClass: number
    submitSameDay: number
    submitLate: number
    accuracy: number
  }
  studentData: {
    isBlank: boolean
    aiPercentage: number
    submittedAt: string | null
    attendanceOnTime: boolean | null
  }
  timeWindows: {
    classEndsAt: string | null
    endOfDay: string | null
    endOfFriday: string | null
  }
}

export type MetaScoreOutput = {
  attendance: number
  punctuality: number
  accuracy: number
  total: number
  totalPossible: number
  punctualityBucket: 'in_class' | 'same_day' | 'friday' | 'late_or_missing' | 'none'
  note: string[]
}

export function calculateMetaScore(input: MetaScoreInput): MetaScoreOutput {
  const {
    assignmentType,
    isOnlineClass,
    weights,
    studentData,
    timeWindows,
  } = input

  const note: string[] = []

  const normalizedAssignmentType = assignmentType ?? 'weekly_exercise'

  // สำหรับงานที่ไม่ใช่ weekly exercise
  // หมายเหตุ: เวอร์ชันนี้ยังใช้ aiPercentage เป็น fallback display score
  // หากภายหลัง exam ใช้คะแนนดิบจริง ควรแยก logic ออกไป
  if (normalizedAssignmentType !== 'weekly_exercise') {
    note.push('Non-weekly assessment: raw score mode (percentage fallback)')
    return {
      attendance: 0,
      punctuality: 0,
      accuracy: round2(studentData.aiPercentage),
      total: round2(studentData.aiPercentage),
      totalPossible: 100,
      punctualityBucket: 'none',
      note,
    }
  }

  // Blank paper = 0 ทุกส่วน
  if (studentData.isBlank) {
    note.push('Blank paper detected')
    return {
      attendance: 0,
      punctuality: 0,
      accuracy: 0,
      total: 0,
      totalPossible: getTotalPossible(weights, isOnlineClass),
      punctualityBucket: 'none',
      note,
    }
  }

  let attendance = 0
  let punctuality = 0
  let accuracy = 0
  let punctualityBucket: MetaScoreOutput['punctualityBucket'] = 'late_or_missing'

  // Attendance
  if (!isOnlineClass) {
    attendance = studentData.attendanceOnTime ? weights.attendance : 0
    note.push(
      studentData.attendanceOnTime
        ? 'On-time attendance'
        : 'No on-time attendance credit'
    )
  } else {
    note.push('Online class: attendance weight skipped')
  }

  // Punctuality
  if (studentData.submittedAt) {
    const submittedAt = new Date(studentData.submittedAt).getTime()

    const classEndsAt = timeWindows.classEndsAt
      ? new Date(timeWindows.classEndsAt).getTime()
      : null

    const endOfDay = timeWindows.endOfDay
      ? new Date(timeWindows.endOfDay).getTime()
      : null

    const endOfFriday = timeWindows.endOfFriday
      ? new Date(timeWindows.endOfFriday).getTime()
      : null

    if (!Number.isFinite(submittedAt)) {
      punctuality = 0
      punctualityBucket = 'late_or_missing'
      note.push('Invalid submission timestamp')
    } else if (classEndsAt !== null && submittedAt <= classEndsAt) {
      punctuality = weights.submitInClass
      punctualityBucket = 'in_class'
      note.push('Submitted in class')
    } else if (endOfDay !== null && submittedAt <= endOfDay) {
      punctuality = weights.submitSameDay
      punctualityBucket = 'same_day'
      note.push('Submitted within same day')
    } else if (endOfFriday !== null && submittedAt <= endOfFriday) {
      punctuality = weights.submitLate
      punctualityBucket = 'friday'
      note.push('Submitted within Friday deadline')
    } else {
      punctuality = 0
      punctualityBucket = 'late_or_missing'
      note.push('Submitted after Friday cutoff or missing')
    }
  } else {
    punctuality = 0
    punctualityBucket = 'late_or_missing'
    note.push('No submission timestamp')
  }

  // Accuracy
  const p = studentData.aiPercentage
  const baseAcc = weights.accuracy

  if (p >= 80) {
    accuracy = baseAcc
  } else if (p >= 70) {
    accuracy = Math.max(0, baseAcc - 0.2)
  } else if (p >= 60) {
    accuracy = Math.max(0, baseAcc - 0.4)
  } else if (p >= 50) {
    accuracy = Math.max(0, baseAcc - 0.6)
  } else {
    accuracy = Math.max(0, baseAcc - 0.8)
  }

  const total = attendance + punctuality + accuracy

  return {
    attendance: round2(attendance),
    punctuality: round2(punctuality),
    accuracy: round2(accuracy),
    total: round2(total),
    totalPossible: getTotalPossible(weights, isOnlineClass),
    punctualityBucket,
    note,
  }
}

function round2(n: number) {
  return Number((n || 0).toFixed(2))
}

function getTotalPossible(
  weights: MetaScoreInput['weights'],
  isOnlineClass: boolean
) {
  const bestPunctuality = Math.max(
    weights.submitInClass,
    weights.submitSameDay,
    weights.submitLate
  )

  return round2(
    (isOnlineClass ? 0 : weights.attendance) +
      bestPunctuality +
      weights.accuracy
  )
}
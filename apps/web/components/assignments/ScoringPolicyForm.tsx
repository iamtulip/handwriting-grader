// apps/web/components/assignments/ScoringPolicyForm.tsx
import React, { useState, useEffect } from 'react';

type PolicyState = {
  w_attendance: number;
  w_submit_in_class: number;
  w_submit_same_day: number;
  w_submit_by_friday: number;
  w_accuracy: number;
  is_online_class: boolean;
};

const DEFAULT_POLICY: PolicyState = {
  w_attendance: 1.0, w_submit_in_class: 1.5, w_submit_same_day: 1.0,
  w_submit_by_friday: 0.5, w_accuracy: 2.5, is_online_class: false
};

export const ScoringPolicyForm = ({ onSave }: { onSave: (p: PolicyState) => void }) => {
  const [type, setType] = useState<'weekly_exercise' | 'exam'>('weekly_exercise');
  const [policy, setPolicy] = useState<PolicyState>(DEFAULT_POLICY);

  // คำนวณผลรวมแบบ Real-time
  const currentSum = 
    policy.w_attendance + policy.w_submit_in_class + 
    policy.w_submit_same_day + policy.w_submit_by_friday + policy.w_accuracy;
  
  const isSumValid = Math.abs(currentSum - 5.0) < 0.001;

  // --- ระบบ Presets (เปลี่ยนเกณฑ์ในคลิกเดียว) ---
  const applyPreset = (presetName: 'normal' | 'online' | 'no_attendance') => {
    if (presetName === 'normal') {
      setPolicy(DEFAULT_POLICY);
    } else if (presetName === 'online') {
      setPolicy({
        w_attendance: 0, w_submit_in_class: 2.5, w_submit_same_day: 1.5,
        w_submit_by_friday: 1.0, w_accuracy: 2.5, is_online_class: true
      });
    } else if (presetName === 'no_attendance') {
      setPolicy({
        w_attendance: 0, w_submit_in_class: 2.0, w_submit_same_day: 1.5,
        w_submit_by_friday: 1.0, w_accuracy: 3.0, is_online_class: false
      });
    }
  };

  const handleWeightChange = (field: keyof PolicyState, val: string) => {
    setPolicy(prev => ({ ...prev, [field]: Number(val) }));
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6 max-w-3xl">
      <h3 className="text-xl font-black text-gray-800 mb-4">เกณฑ์การให้คะแนน (Scoring Policy)</h3>
      
      {/* 1. เลือกประเภท */}
      <div className="flex gap-4 mb-6">
        <label className="flex items-center gap-2 cursor-pointer font-bold">
          <input type="radio" checked={type === 'weekly_exercise'} onChange={() => setType('weekly_exercise')} className="w-5 h-5 text-blue-600" />
          แบบฝึกหัดรายสัปดาห์ (Meta-Scoring 5 แต้ม)
        </label>
        <label className="flex items-center gap-2 cursor-pointer font-bold">
          <input type="radio" checked={type === 'exam'} onChange={() => setType('exam')} className="w-5 h-5 text-blue-600" />
          สอบ Quiz / Midterm / Final (คะแนนดิบ)
        </label>
      </div>

      {type === 'weekly_exercise' && (
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          
          {/* 2. Presets */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">เลือกเกณฑ์ล่วงหน้า (Presets)</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => applyPreset('normal')} className="px-4 py-2 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition">📝 ปกติ (Normal)</button>
              <button type="button" onClick={() => applyPreset('online')} className="px-4 py-2 bg-purple-100 text-purple-700 font-bold rounded-lg hover:bg-purple-200 transition">🌧️ ออนไลน์ / ฝนตก</button>
              <button type="button" onClick={() => applyPreset('no_attendance')} className="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition">🚫 ไม่คิดเช็คชื่อ</button>
            </div>
          </div>

          <hr className="my-6 border-gray-200" />

          {/* 3. ปรับแต่งเกณฑ์เอง (Fine-tune) */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* โหมดออนไลน์ Toggle */}
            <div className="col-span-2 mb-2 flex items-center justify-between bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <span className="font-bold text-yellow-800">โหมดคลาสออนไลน์ (ปิดช่องเช็คชื่อ)</span>
              <input type="checkbox" className="w-6 h-6" checked={policy.is_online_class} onChange={(e) => setPolicy(p => ({ ...p, is_online_class: e.target.checked, w_attendance: e.target.checked ? 0 : p.w_attendance }))} />
            </div>

            {/* ช่องกรอกคะแนน */}
            <div>
              <label className="block text-sm font-bold text-gray-700">คะแนนเข้าเรียน</label>
              <input type="number" step="0.1" disabled={policy.is_online_class} value={policy.w_attendance} onChange={(e) => handleWeightChange('w_attendance', e.target.value)} className="mt-1 w-full border border-gray-300 p-2 rounded disabled:bg-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">คะแนนความถูกต้อง (Accuracy)</label>
              <input type="number" step="0.1" value={policy.w_accuracy} onChange={(e) => handleWeightChange('w_accuracy', e.target.value)} className="mt-1 w-full border border-gray-300 p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">ส่งทันในคาบเรียน</label>
              <input type="number" step="0.1" value={policy.w_submit_in_class} onChange={(e) => handleWeightChange('w_submit_in_class', e.target.value)} className="mt-1 w-full border border-gray-300 p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">ส่งภายในวันเดียวกัน</label>
              <input type="number" step="0.1" value={policy.w_submit_same_day} onChange={(e) => handleWeightChange('w_submit_same_day', e.target.value)} className="mt-1 w-full border border-gray-300 p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">ส่งช้าสุดภายในวันศุกร์</label>
              <input type="number" step="0.1" value={policy.w_submit_by_friday} onChange={(e) => handleWeightChange('w_submit_by_friday', e.target.value)} className="mt-1 w-full border border-gray-300 p-2 rounded" />
            </div>
            
            {/* Real-time Sum Validation */}
            <div className={`col-span-2 flex items-center justify-between p-4 rounded-lg border-2 mt-4 ${isSumValid ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700'}`}>
              <span className="font-black text-lg">ผลรวมคะแนน: {currentSum.toFixed(2)} / 5.0</span>
              {!isSumValid && <span className="font-bold">❌ ต้องรวมให้ได้ 5.0 พอดี</span>}
              {isSumValid && <span className="font-bold">✅ พร้อมใช้งาน</span>}
            </div>

          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button 
          onClick={() => onSave(policy)} 
          disabled={type === 'weekly_exercise' && !isSumValid}
          className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          บันทึกเกณฑ์และสร้างงาน
        </button>
      </div>
    </div>
  );
};
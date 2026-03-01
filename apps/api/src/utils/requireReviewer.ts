// apps/api/src/utils/requireReviewer.ts
import { Request, Response, NextFunction } from 'express';

// 1. สร้าง Interface ใหม่เพื่อบอก TypeScript ว่า Request ของเราจะมี .user แนบมาด้วย
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role?: string;
  };
}

// 2. สร้าง Middleware (ชั่วคราวไว้สำหรับให้ TypeScript ผ่าน และเตรียมเชื่อม Auth จริง)
export const requireReviewer = (req: AuthRequest, res: Response, next: NextFunction) => {
  // TODO: เชื่อมต่อตรวจสอบ JWT จาก Supabase ในอนาคต
  // ตอนนี้จำลอง (Mock) ข้อมูล User ไปก่อนเพื่อให้ระบบทดสอบรันได้
  req.user = { id: 'mock-reviewer-uuid-1234', role: 'reviewer' };
  next();
};
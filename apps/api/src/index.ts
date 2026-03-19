// apps/api/src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// โหลดค่าจากไฟล์ .env (เช่น พอร์ต หรือคีย์ Supabase)
dotenv.config();

// ==========================================
// 1. นำเข้า (Import) Routes ทั้งหมดที่เราสร้างไว้
// ==========================================
import reviewerRoutes from './routes/reviewer';
import rosterRoutes from './routes/rosters';
import registrationRoutes from './routes/registration';
import studentRoutes from './routes/student';
import gradeRoutes from './routes/grades';

const app = express();

// ==========================================
// 2. ตั้งค่า Middleware (ด่านตรวจก่อนเข้า API)
// ==========================================
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
// ขยาย limit เป็น 50mb เพื่อรองรับการส่ง Base64 รูปภาพกระดาษคำตอบ หรือ JSON ขนาดใหญ่
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// 3. Health Check (เส้นทางสำหรับทดสอบว่า Server รันติดไหม)
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Diamond V2 API is running smoothly! 💎🚀',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 4. ผูกเส้นทาง API (Mounting Routes)
// ==========================================
app.use('/api/reviewer', reviewerRoutes);         // ระบบตรวจข้อสอบของอาจารย์/สตาฟฟ์
app.use('/api/rosters', rosterRoutes);            // ระบบอัปโหลดรายชื่อจากไฟล์ SIS
app.use('/api/registration', registrationRoutes); // ระบบลงทะเบียนและยืนยันตัวตนนักศึกษา
app.use('/api/student', studentRoutes);           // ระบบ Dashboard และส่งงานของนักศึกษา
app.use('/api/grades', gradeRoutes);              // ระบบคำนวณและส่งออกคะแนน (Export Excel)

// ==========================================
// 5. ดักจับ Error กรณีเรียก URL ที่ไม่มีอยู่จริง (404 Not Found)
// ==========================================
app.use((req, res) => {
  res.status(404).json({ error: 'API Route Not Found' });
});

// ==========================================
// 6. เริ่มเปิดเซิร์ฟเวอร์ (Start Server)
// ==========================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`💎 Diamond V2 API is successfully running`);
  console.log(`📡 Server listening on: http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=================================================\n`);
});
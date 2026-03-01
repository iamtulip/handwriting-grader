# Database Architecture (Supabase / Postgres)

## Overview
ระบบฐานข้อมูลถูกออกแบบมาเพื่อรองรับ AI Grading System โดยเน้นที่ Idempotency (รันซ้ำได้ผลลัพธ์เดิม), Auditability (ตรวจสอบย้อนหลังได้ทุก Transaction), และ Strict Access Control ผ่าน Row Level Security (RLS)

## Core Entities
1. **Assignments:** เก็บโจทย์และ Answer Key JSON (โครงสร้าง Zod Validated)
2. **Submissions:** กระดาษคำตอบของนักศึกษา พร้อม Track Status Workflow
3. **Submission Files:** ไฟล์ภาพหน้าข้อสอบ (รองรับ Multi-page)
4. **Jobs (OCR & Extraction):** Queue Table สำหรับ Async Worker Tracking
5. **Grading Results:** เก็บผลการตรวจรายข้อแยกระหว่าง Auto และ Final (Override)
6. **Review Claims:** ระบบ Concurrency Lock ป้องกัน Reviewer 2 คนตรวจแผ่นเดียวกัน
7. **Appeals:** ระบบยื่นคำร้องจากนักศึกษา
8. **Audit Logs:** บันทึกการเปลี่ยนแปลงข้อมูลระดับแถว (Row-level) อัตโนมัติผ่าน Postgres Trigger

## Job States (Submission Lifecycle)
`uploaded` -> `ocr_pending` -> `ocr_running` -> `ocr_done` -> `extract_pending` -> `extract_running` -> `extract_done` -> `grade_pending` -> `grade_running` -> `graded` / `needs_review` -> `reviewing` -> `published` -> `appeal_open` -> `appeal_resolved`

## Security Strategy (RLS)
- **Students:** SELECT เฉพาะ `submissions`, `grading_results`, `appeals` ที่ `user_id` ตรงกับตัวเอง
- **Reviewers:** SELECT ได้เฉพาะที่ได้รับ Assigned หรืออยู่ในวิชาตัวเอง, UPDATE เฉพาะ Submission ที่มี Lock ใน `review_claims`
- **Admins:** Full Access (Bypass)
- **Service Workers:** ใช้ `SERVICE_ROLE_KEY` bypass RLS เพื่อรัน Background Jobs

อัพเดต
# Database Architecture & Security Model (V2)

## Overview
ระบบฐานข้อมูลอัปเกรดใหม่ (Secure by Default) อุดช่องโหว่ตาม Security Audit Report มุ่งเน้นไปที่ความปลอดภัยของข้อมูลการสอบ (Answer Key Secrecy) และการป้องกัน Race Condition

## Core Security Implementations
1. **Answer Key Isolation:** แยก `answer_key` ออกจากตาราง `assignments` ไปไว้ที่ `assignment_answer_keys` เพื่อป้องกันนักศึกษาอ่านเฉลย
2. **Strict RLS:** เปิด RLS 100% ทุกตาราง โดยใช้ Helper Function `get_my_role()` ในการประเมินสิทธิ์
3. **Storage Path Protection:** นักศึกษาจะเห็นแค่ View `submission_files_safe` เพื่อซ่อน storage path จริง
4. **Atomic Concurrency:** การ Claim งานของ Reviewer ใช้ Advisory Locks & Function `claim_submission_for_review` เพื่อป้องกัน Race Condition
5. **Cost Bomb Protection:** Job Workers (OCR/Extraction) ถูกจำกัด Retry สูงสุด 3 ครั้ง (max_attempts) หากเกินจะปรับสถานะเป็น `dead_letter`
6. **Audit Trail:** Trigger ระบบ `audit_logs` ถูกปรับปรุงใหม่ ป้องกัน Privilege Escalation และตรวจสอบ JWT Sub อย่างปลอดภัย
7. **Auto Cleanup:** ใช้ `pg_cron` คืนสถานะงานที่ Reviewer ดองไว้เกินเวลา (Expired Claims) กลับเข้าคิวอัตโนมัติ

# Database Architecture & Security Model (V3 Ultimate)

## Security Upgrades (V2 -> V3)
- **N+1 Query Eliminated:** RLS ไม่เรียก Table `user_profiles` อีกต่อไป แต่เช็คสิทธิ์แบบ O(1) ผ่าน `custom_access_token_hook` ที่ผัง Role ไว้ใน JWT
- **Zero-Exposure Storage:** ตาราง `submission_files` ถูกล็อกทิ้ง 100% นักศึกษาจะ Query ได้เฉพาะ View `submission_files_safe` เท่านั้น (ป้องกันการดึง storage_path)
- **Atomic Concurrency (TOCTOU Fix):** ระบบ `pg_cron` ล้างคิวที่หมดอายุ ใช้ CTE (`WITH expired AS...`) เพื่อป้องกันการสับหลอก (Race Condition) แบบมิลลิวินาที
- **Cost Guard:** `guard_job_attempts` เช็คเงื่อนไขทันทีก่อน Increment ป้องกัน Worker วนลูปติดบัคกินเงินค่า API แบบไร้ขีดจำกัด

# Database Architecture (V4 Final Fortress)

## Security Enhancements (Round 3 Patches M-V)
- **Zero Hardcoding (Patch M):** รหัสผ่านสำหรับการเทสจะถูกดึงผ่าน Interactive Prompt ของ PowerShell และบล็อกไฟล์ Config ไม่ให้หลุดขึ้น Git 
- **View-Level RLS (Patch N):** การสร้าง View เพื่อซ่อน `storage_path` ถูกล็อกไว้ด้วย `security_invoker = true` และใช้ RLS ของตารางหลักตรวจสอบ Ownership อีกชั้น
- **Fail-Safe JWT (Patch O):** โค้ดดึงสิทธิ์ถูกแก้ให้คายค่า `NULL` ทันทีที่ไม่มี Token ป้องกัน Service Role ตกเป็นสิทธิ์ Student โดยไม่ได้ตั้งใจ
- **Cost Guard Edge Case (Patch P):** Worker ป้องกันตัวเองจากการ Retry ซ้ำซ้อน แม้งานจะ Success แล้วก็ตาม
- **Immutable Claims (Patch Q):** เวลาเริ่มต้น (`claimed_at`) ถูกล็อกไว้ด้วยระดับ Database Trigger ทำให้ Reviewer ห้ามแก้เวลาหลอกระบบ และกำหนดโควตาต่ออายุไว้ที่ 2 ชั่วโมงชัดเจน

# Database Architecture (V5 Absolute Final)

## The Final Security Enhancements (Round 4 Patches W-AB)
- **CI/CD Reliability (Patch W):** `seed.ts` ใช้ระบบ Retry Loop แบบ Exponential Backoff รอจนกว่า Trigger จะสร้าง Profile เสร็จสมบูรณ์ ลบปัญหา Flaky Testing 100%
- **Cloud Migration Safe (Patch X):** การสร้าง Trigger บน `auth.users` ถูกห่อด้วย `DO $$ BEGIN` เพื่อเช็ค Privileges ป้องกัน Migration พังยับบน Supabase Cloud
- **Role Escalation Blocked (Patch Y):** กฎการ Update `user_profiles` บังคับ `WITH CHECK` ป้องกันไม่ให้นักศึกษาแฮ็กเพิ่มสิทธิ์ตัวเองเป็น Admin
- **Appeal Integrity (Patch Z):** กฎการอุทธรณ์คะแนนแยกขาดระหว่าง Role ชัดเจน Reviewer ห้ามสร้าง Appeal ปลอมในนามนักศึกษาเด็ดขาด
- **Column-Level Secrecy (Patch AA):** ยกเลิกการให้สิทธิ์ SELECT `storage_path` ทิ้งทั้งหมดในตารางหลัก ทำให้ไม่มีช่องโหว่ใดๆ ที่จะดึง Path ได้ แม้จะเป็นบัคจากการ JOIN 
- **Production Guard (Patch AB):** เช็ค Allowlist ที่แน่นหนา (localhost เท่านั้น) ควบคู่กับ ENV Flag `ALLOW_SEED=true`

# Database Architecture (V6 Production Ready ✅)

## Final Precision Fixes (Round 5 Patches AC-AF)
- **Role Lock Trigger (Patch AC):** เลิก Hardcode `role = 'student'` ใน RLS แต่ใช้ `lock_user_role` Trigger แทน ทำให้ Reviewer และ Student แก้ไขข้อมูลตัวเองได้โดยที่ Role ไม่ถูกปรับเปลี่ยน
- **Appeal Immutability (Patch AD):** ป้องกันช่องโหว่ Subquery Syntax Error ด้วย Trigger `lock_appeal_ownership` ที่ป้องกันการปลอมแปลงผู้เขียนคำร้องแทน
- **True Idempotent Seeding (Patch AE):** `seed.ts` ลบ Account เก่าทิ้งทุกครั้งที่รัน ทำให้ทำงานซ้ำได้ไม่มีพัง และ `process.exit(1)` ทันทีหากมี Error ร้ายแรง
- **Explicit Storage Deny (Patch AF):** คำสั่ง `REVOKE` ถูกย้ายมาทำท้ายสุดหลังการตั้งค่า RLS เพื่อให้ชัวร์ 100% ว่าไม่มีการสอดไส้สิทธิ์ และสงวน `storage_path` ไว้สำหรับ Worker เท่านั้น

# Database Architecture (V7 Gold Master 🏆)

## The Final Micro-Sweep Enhancements (V6 -> V7)
- **Service Role Bypass (Note 1):** Trigger `lock_user_role` เปิดทางให้ Service Role (`auth.uid() IS NULL`) สามารถข้ามการบล็อก เพื่อให้รันคำสั่ง Seed ผ่าน CLI สำเร็จ
- **Bulletproof Seeding (Note 2):** สคริปต์ล้างข้อมูลจะวนลูปค้นหาอีเมลทดสอบโดยตรง ป้องกันบัคจาก Pagination Limit ที่ 50 รายชื่อ 
- **Absolute Privacy (Note 3):** กฎ `users_read_own_profile` ถูกตีกรอบแคบลง 100% ทำให้ Reviewer จะเห็นโปรไฟล์เฉพาะ "เด็กที่ตัวเองกดรับตรวจอยู่" เท่านั้น

# Database Architecture (V11 Diamond Master 💎)

## Master Fixes (The Final Audit)
- **Zero Exposure Protocol:** `REVOKE ALL ON public.submission_files FROM PUBLIC, anon, authenticated` ทำให้ Client ทุกประเภท (แม้แต่คนที่แฮก Bypass RLS ได้) ก็ไม่สามารถ Select ข้อมูลจากตารางหลักได้ ต้องอ่านผ่าน View `submission_files_safe` เท่านั้น
- **Reviewer Privacy:** เปลี่ยน RLS Policy ของ `reviewer_assignments` ให้ Reviewer เห็นเฉพาะตารางงานของตัวเองเท่านั้น ปิดจุดบอดการส่องดูคิวงานของอาจารย์ท่านอื่น
- **Admin Safe Claim:** แยกฟังก์ชัน Claim สำหรับ Admin ออกมาเป็น `admin_assign_claim` โดยบังคับระบุ `reviewer_id` ตรงๆ เพื่อให้การยิงคำสั่งจาก Service Role (Backoffice) ทำงานได้โดยไม่ติดบัค `auth.uid() IS NULL`
- **Cost Bomb Shield:** `guard_job_attempts` มีเงื่อนไข `IF NEW.attempts < OLD.attempts THEN RAISE EXCEPTION` ป้องกัน Worker สติแตกแล้วรีเซ็ตค่ากลับไปมาไม่รู้จบ
- **Strict Seed Validation:** ทุกๆ Operation ใน `seed.ts` ถูกบังคับตรวจสอบ `{ error }` และ Throw ออกมาอย่างชัดเจน เพื่อป้องกันปัญหา Silent Fail ใน CI/CD
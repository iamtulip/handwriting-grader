// scripts/seed.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

// ✅ Exact Local Host Match
const ALLOWED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const parsed = new URL(process.env.SUPABASE_URL || 'http://localhost');
const urlHost = parsed.hostname;
const urlProtocol = parsed.protocol;

const isLocalHost = ALLOWED_LOCAL_HOSTS.has(urlHost);
const isLocalProtocol = (urlProtocol === 'http:' || urlProtocol === 'https:');

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.ALLOW_SEED !== 'true' ||
  !isLocalProtocol ||
  !isLocalHost;

if (IS_PRODUCTION) {
  console.error("🚨 BLOCKED: Seed requires ALLOW_SEED=true and strict loopback Supabase URL!");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !SEED_PASSWORD) {
  console.error("❌ Missing required ENV variables. Run setup-db.ps1 first.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function cleanupExistingTestUsers() {
  const emails = ['student@psu.ac.th', 'reviewer@psu.ac.th', 'admin@psu.ac.th'];
  const targets = new Set(emails);
  let page = 1;
  
  while (targets.size > 0) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.warn(`⚠️ Warning: ${error.message}`); break; }
    
    const users = data?.users || [];
    for (const u of users) {
      if (u.email && targets.has(u.email)) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
        if (delErr) throw new Error(`Failed to delete ${u.email}: ${delErr.message}`);
        console.log(`🗑️ Cleaned up: ${u.email}`);
        targets.delete(u.email);
      }
    }
    if (users.length < 200) break;
    page += 1;
  }
}

async function waitForProfile(userId: string, maxRetries = 10): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await supabase.from('user_profiles').select('id').eq('id', userId).single();
    if (data) return;
    await new Promise(r => setTimeout(r, 200 * (i + 1))); 
  }
  throw new Error(`Profile not created for user ${userId}`);
}

async function main() {
  console.log("🌱 Starting V11 Diamond Master Seeding...");

  await cleanupExistingTestUsers();

  try {
    const { data: studentAuth, error: e1 } = await supabase.auth.admin.createUser({ email: 'student@psu.ac.th', password: SEED_PASSWORD, email_confirm: true, user_metadata: { full_name: 'สมหญิง รักเรียน' } });
    if (e1) throw new Error(e1.message);
    const { data: reviewerAuth, error: e2 } = await supabase.auth.admin.createUser({ email: 'reviewer@psu.ac.th', password: SEED_PASSWORD, email_confirm: true, user_metadata: { full_name: 'อ.ใจดี ตรวจไว' } });
    if (e2) throw new Error(e2.message);
    const { data: adminAuth, error: e3 } = await supabase.auth.admin.createUser({ email: 'admin@psu.ac.th', password: SEED_PASSWORD, email_confirm: true, user_metadata: { full_name: 'ดร. สมชาย (CTO)' } });
    if (e3) throw new Error(e3.message);

    await waitForProfile(adminAuth.user.id);
    await waitForProfile(reviewerAuth.user.id);
    await waitForProfile(studentAuth.user.id);

    // ✅ [Fix 4] เช็ค Error ทุกบรรทัดป้องกัน Silent Fail
    {
      const { error } = await supabase.from('user_profiles').update({ role: 'admin', student_id_number: 'ADMIN-01' }).eq('id', adminAuth.user.id);
      if (error) throw new Error(`Admin profile update failed: ${error.message}`);
    }
    {
      const { error } = await supabase.from('user_profiles').update({ role: 'reviewer', student_id_number: 'REV-01' }).eq('id', reviewerAuth.user.id);
      if (error) throw new Error(`Reviewer profile update failed: ${error.message}`);
    }
    {
      const { error } = await supabase.from('user_profiles').update({ student_id_number: '6610110001' }).eq('id', studentAuth.user.id);
      if (error) throw new Error(`Student profile update failed: ${error.message}`);
    }

    let assignmentId;
    {
      const { data, error } = await supabase.from('assignments').insert({ title: 'แบบฝึกหัดที่ 10: การผ่อนชำระ', created_by: adminAuth.user.id }).select('id').single();
      if (error) throw new Error(`Assignment insert failed: ${error.message}`);
      assignmentId = data.id;
    }
    
    {
      const { error } = await supabase.from('reviewer_assignments').insert({ reviewer_id: reviewerAuth.user.id, assignment_id: assignmentId });
      if (error) throw new Error(`Reviewer assignment insert failed: ${error.message}`);
    }

    {
      const { error } = await supabase.from('assignment_answer_keys').insert({ assignment_id: assignmentId, answer_key: { "assignment_meta": { "total_score": 10 } }, grading_config: { "tolerance": 0.05 } });
      if (error) throw new Error(`Answer Key insert failed: ${error.message}`);
    }

    let submissionId;
    {
      const { data, error } = await supabase.from('submissions').insert({ assignment_id: assignmentId, student_id: studentAuth.user.id, status: 'uploaded' }).select('id').single();
      if (error) throw new Error(`Submission insert failed: ${error.message}`);
      submissionId = data.id;
    }

    {
      const { error } = await supabase.from('submission_files').insert({ submission_id: submissionId, page_number: 1, storage_path: 'exams/w15-1-student1.pdf' });
      if (error) throw new Error(`Submission files insert failed: ${error.message}`);
    }

    console.log("🎉 V11 Diamond Baseline Seeding completed successfully!");
  } catch (err: any) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1); 
  }
}
main();
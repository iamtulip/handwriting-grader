// apps/web/app/api/submissions/upload/route.ts
import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const supabaseUser = createClient();
    const supabaseAdmin = createAdminClient();

    // 1. ตรวจสอบ Session (Authentication)
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. รับข้อมูลแบบ multipart/form-data
    const formData = await req.formData();
    const assignment_id = formData.get('assignment_id') as string;
    const files = formData.getAll('files') as File[];

    if (!assignment_id || files.length === 0) {
      return NextResponse.json({ error: 'Missing assignment_id or files' }, { status: 400 });
    }

    // 3. Idempotency Check (เช็คว่าเคยส่งวิชานี้หรือยัง)
    // ถ้านักศึกษาเคยกดส่งแล้ว ระบบจะดึง ID เดิมมา ไม่สร้างใหม่ (ป้องกันขยะใน DB)
    let submissionId: string;
    
    const { data: existingSub } = await supabaseAdmin
      .from('submissions')
      .select('id, status')
      .eq('assignment_id', assignment_id)
      .eq('student_id', user.id)
      .single();

    if (existingSub) {
      if (existingSub.status !== 'uploaded' && existingSub.status !== 'ocr_failed') {
         return NextResponse.json({ error: 'Submission is already processing or graded.' }, { status: 403 });
      }
      submissionId = existingSub.id;
      // ลบไฟล์เก่าทิ้ง (เพื่ออัปเดตใหม่)
      await supabaseAdmin.from('submission_files').delete().eq('submission_id', submissionId);
    } else {
      const { data: newSub, error: insertError } = await supabaseAdmin
        .from('submissions')
        .insert({
          assignment_id,
          student_id: user.id,
          status: 'uploaded'
        })
        .select('id')
        .single();
      
      if (insertError) throw insertError;
      submissionId = newSub.id;
    }

    // 4. Upload Files ลง Storage และบันทึก Metadata
    const fileRecords = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split('.').pop();
      const storagePath = `submissions/${assignment_id}/${user.id}/${uuidv4()}.${fileExt}`;

      // Upload via Admin Client (Bypass Storage RLS Policy)
      const { error: uploadError } = await supabaseAdmin.storage
        .from('exam-papers')
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      fileRecords.push({
        submission_id: submissionId,
        page_number: i + 1,
        storage_path: storagePath
      });
    }

    // บันทึก Path ลง Table
    const { error: fileInsertError } = await supabaseAdmin
      .from('submission_files')
      .insert(fileRecords);

    if (fileInsertError) throw fileInsertError;

    // 5. เปลี่ยนสถานะเป็น ocr_pending เพื่อส่งไม้ต่อให้ Worker (Phase 3)
    await supabaseAdmin
      .from('submissions')
      .update({ status: 'ocr_pending' })
      .eq('id', submissionId);

    return NextResponse.json({ success: true, submission_id: submissionId, message: 'Files uploaded successfully. Queued for OCR.' });

  } catch (error: any) {
    console.error('[Upload Error]:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
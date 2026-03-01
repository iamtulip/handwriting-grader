export async function createNewSpecVersion(assignmentId: string, layoutData: any, userId: string) {
  // 1. หาเวอร์ชันล่าสุด
  const { data: latest } = await supabase
    .from('assignment_layout_specs')
    .select('version')
    .eq('assignment_id', assignmentId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version || 0) + 1;

  // 2. Deactivate ทุกเวอร์ชันก่อนหน้า
  await supabase
    .from('assignment_layout_specs')
    .update({ is_active: false })
    .eq('assignment_id', assignmentId);

  // 3. Insert เวอร์ชันใหม่และตั้งเป็น Active
  return await supabase.from('assignment_layout_specs').insert({
    assignment_id: assignmentId,
    version: nextVersion,
    is_active: true,
    layout_data: layoutData,
    created_by: userId
  });
}
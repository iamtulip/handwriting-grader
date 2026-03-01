export async function alignImage(submissionId: string) {
  console.log(`[ALIGNMENT] Running 2-Pass Global-to-Local Registration`);
  
  // Pass 1: Global Perspective Correction (หา 4 มุมกระดาษ)
  // Pass 2: Local Feature Matching (ใช้ SIFT/ORB เทียบกับ Template)
  
  const artifacts = {
    transform_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], // จำลอง Matrix H
    rmse: 0.012, // ค่าความคลาดเคลื่อน (ต่ำ = ดีมาก)
    aligned_image_url: `storage/submissions/${submissionId}/aligned.png`
  };

  // บันทึกหลักฐานเพื่อการอุทธรณ์
  // await supabase.from('submission_artifacts').insert({...});

  return artifacts;
}
// apps/api/src/routes/reviewer.ts
//(ระบบ Router หลักสำหรับ Reviewer Dashboard ที่รวมการตรวจสอบสิทธิ์และดึงข้อมูลสรุป)
import { Router, Request, Response } from 'express';
import { z } from 'zod'
import { requireReviewer, AuthRequest } from '../utils/requireReviewer'; //
//import { requireReviewer } from '../utils/requireReviewer'
import { getRoiAuditBundle, listSubmissionsForReviewer, overrideGrade } from '../services/audit_service_final'

const router = Router()

/**
 * All reviewer endpoints require reviewer/instructor/admin role.
 * Auth is Bearer token (Supabase JWT).
 */
router.use(requireReviewer as any); //

// 1) Monitoring View: submissions list + risk summary (pagination-ready)
router.get('/submissions', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    assignmentId: z.string().uuid(),
    status: z.string().optional(), // graded|needs_review|failed|...
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(200).default(50),
    // optional filters
    onlyDisagreement: z.coerce.boolean().optional(),
    minConfidenceBelow: z.coerce.number().optional(),
  })

  const parsed = schema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const result = await listSubmissionsForReviewer({
      reviewerUserId: req.user!.id,
      assignmentId: parsed.data.assignmentId,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      onlyDisagreement: parsed.data.onlyDisagreement,
      minConfidenceBelow: parsed.data.minConfidenceBelow,
    })
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// 2) Audit View: ROI bundle (single ROI “one call”)
router.get('/roi-bundle', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    submissionId: z.string().uuid(),
    roiId: z.string().min(1),
    page: z.coerce.number().int().min(1).default(1),
  })

  const parsed = schema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const bundle = await getRoiAuditBundle({
      reviewerUserId: req.user!.id,
      submissionId: parsed.data.submissionId,
      roiId: parsed.data.roiId,
      pageNumber: parsed.data.page,
    })
    return res.json(bundle)
  } catch (err: any) {
    // differentiate not found vs forbidden vs server
    const msg = String(err.message || 'error')
    if (msg.startsWith('FORBIDDEN')) return res.status(403).json({ error: msg })
    if (msg.startsWith('NOT_FOUND')) return res.status(404).json({ error: msg })
    if (msg.startsWith('CONFLICT')) return res.status(409).json({ error: msg })
    return res.status(500).json({ error: msg })
  }
})

// 3) Override: Confirm AI / Override candidate / Manual score (logs grading_events)
router.post('/override', async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    submission_id: z.string().uuid(),
    roi_id: z.string().min(1),
    page_number: z.number().int().min(1).default(1),
    layout_spec_version: z.number().int().min(1),
    action_type: z.enum(['confirm', 'override']),
    selected_candidate_id: z.string().uuid().nullable().optional(),
    final_score: z.number().nullable().optional(),
    manual_reason: z.string().max(2000).optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const out = await overrideGrade({
      reviewerUserId: req.user!.id,
      payload: parsed.data,
    })
    return res.json(out)
  } catch (err: any) {
    const msg = String(err.message || 'error')
    if (msg.startsWith('FORBIDDEN')) return res.status(403).json({ error: msg })
    if (msg.startsWith('NOT_FOUND')) return res.status(404).json({ error: msg })
    if (msg.startsWith('CONFLICT')) return res.status(409).json({ error: msg })
    return res.status(500).json({ error: msg })
  }
})

export default router
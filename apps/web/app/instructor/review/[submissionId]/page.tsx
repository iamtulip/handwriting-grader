import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{
    submissionId: string
  }>
}

export default async function InstructorReviewSubmissionPage({ params }: PageProps) {
  const { submissionId } = await params
  redirect(`/admin/review/${submissionId}`)
}
//apps/web/lib/google/documentai.ts
import { DocumentProcessorServiceClient } from '@google-cloud/documentai'

let cachedClient: DocumentProcessorServiceClient | null = null

export function getDocumentAiClient() {
  if (cachedClient) return cachedClient

  const inlineJson = process.env.GCP_SERVICE_ACCOUNT_JSON

  if (inlineJson) {
    const credentials = JSON.parse(inlineJson)
    cachedClient = new DocumentProcessorServiceClient({ credentials })
    return cachedClient
  }

  cachedClient = new DocumentProcessorServiceClient()
  return cachedClient
}

export function getDocumentAiProcessorName() {
  const projectId = process.env.GCP_PROJECT_ID
  const location = process.env.GCP_LOCATION
  const processorId = process.env.DOCAI_PROCESSOR_ID

  if (!projectId || !location || !processorId) {
    throw new Error('Missing Document AI env: GCP_PROJECT_ID / GCP_LOCATION / DOCAI_PROCESSOR_ID')
  }

  return `projects/${projectId}/locations/${location}/processors/${processorId}`
}
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const cwd = process.cwd()

const envCandidates = [
  path.resolve(cwd, '.env.local'),
  path.resolve(cwd, '.env'),
  path.resolve(cwd, '../../.env.local'),
  path.resolve(cwd, '../../.env'),
]

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false })
  }
}

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL')
}

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
}

export const supabase = createClient(supabaseUrl, serviceRoleKey)
import { spawn } from 'child_process'

export type PaddleBridgeResult = {
  text: string
  confidence: number
}

const PADDLE_TIMEOUT_MS = 30000

export async function runPaddleOnBuffer(
  image: Buffer
): Promise<PaddleBridgeResult[]> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['src/stages/paddle_ocr_service.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finishResolve = (value: PaddleBridgeResult[]) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const finishReject = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }

    const timer = setTimeout(() => {
      try {
        py.kill()
      } catch {}
      finishReject(new Error(`Paddle OCR timeout after ${PADDLE_TIMEOUT_MS} ms`))
    }, PADDLE_TIMEOUT_MS)

    py.stdout.on('data', (d) => {
      stdout += d.toString()
    })

    py.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    py.on('error', (err) => {
      clearTimeout(timer)
      finishReject(err)
    })

    py.stdin.on('error', (err: any) => {
      clearTimeout(timer)
      finishReject(new Error(`Paddle stdin error: ${err?.message ?? String(err)}`))
    })

    py.on('close', (code) => {
      clearTimeout(timer)

      if (settled) return

      if (code !== 0) {
        finishReject(
          new Error(`Paddle bridge failed: ${stderr || `exit code ${code}`}`)
        )
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        if (!Array.isArray(parsed)) {
          finishResolve([])
          return
        }

        const cleaned = parsed
          .map((item: any) => ({
            text: String(item?.text ?? '').trim(),
            confidence: Number(item?.confidence ?? 0),
          }))
          .filter((item) => item.text.length > 0)

        finishResolve(cleaned)
      } catch {
        finishReject(new Error(`Invalid Paddle JSON output: ${stdout}`))
      }
    })

    try {
      py.stdin.write(image)
      py.stdin.end()
    } catch (err: any) {
      clearTimeout(timer)
      try {
        py.kill()
      } catch {}
      finishReject(new Error(`Failed to write image buffer to Paddle stdin: ${err?.message ?? String(err)}`))
    }
  })
}
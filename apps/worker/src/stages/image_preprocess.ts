import sharp from 'sharp'

export type PreprocessedVariant = {
  name: string
  image: Buffer
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

async function extractInnerPercent(
  input: Buffer,
  pxLeft: number,
  pxTop: number,
  pxRight: number,
  pxBottom: number
): Promise<Buffer> {
  const meta = await sharp(input).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0

  if (!width || !height) {
    return input
  }

  const left = clamp(Math.floor(width * pxLeft), 0, width - 1)
  const top = clamp(Math.floor(height * pxTop), 0, height - 1)
  const right = clamp(Math.ceil(width * (1 - pxRight)), left + 1, width)
  const bottom = clamp(Math.ceil(height * (1 - pxBottom)), top + 1, height)

  const extractWidth = Math.max(1, right - left)
  const extractHeight = Math.max(1, bottom - top)

  return await sharp(input)
    .extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight,
    })
    .png()
    .toBuffer()
}

async function buildTightTrimVariant(input: Buffer): Promise<Buffer> {
  const bin = await sharp(input)
    .grayscale()
    .normalize()
    .threshold(185)
    .png()
    .toBuffer()

  return await sharp(bin)
    .trim()
    .png()
    .toBuffer()
}

export async function buildPreprocessedVariants(input: Buffer): Promise<PreprocessedVariant[]> {
  const rotated = await sharp(input).rotate().png().toBuffer()

  const grayscale = await sharp(rotated)
    .grayscale()
    .normalize()
    .png()
    .toBuffer()

  const threshold = await sharp(rotated)
    .grayscale()
    .normalize()
    .threshold(170)
    .png()
    .toBuffer()

  const enlarged = await sharp(rotated)
    .grayscale()
    .normalize()
    .resize({
      width: 1800,
      withoutEnlargement: false,
    })
    .sharpen()
    .png()
    .toBuffer()

  const highContrast = await sharp(rotated)
    .grayscale()
    .linear(1.25, -12)
    .normalize()
    .sharpen()
    .png()
    .toBuffer()

  // ตัดขอบเส้นกรอบตารางด้านซ้าย/บน/ล่างออกบางส่วน
  const innerBorderStripped = await extractInnerPercent(rotated, 0.06, 0.08, 0.03, 0.10)

  const innerHighContrast = await sharp(innerBorderStripped)
    .grayscale()
    .normalize()
    .resize({
      width: 1800,
      withoutEnlargement: false,
    })
    .sharpen()
    .png()
    .toBuffer()

  const tightTrim = await buildTightTrimVariant(rotated)

  const tightTrimEnlarged = await sharp(tightTrim)
    .grayscale()
    .normalize()
    .resize({
      width: 1800,
      withoutEnlargement: false,
    })
    .sharpen()
    .png()
    .toBuffer()

  return [
    { name: 'original', image: rotated },
    { name: 'grayscale', image: grayscale },
    { name: 'threshold', image: threshold },
    { name: 'enlarged', image: enlarged },
    { name: 'high_contrast', image: highContrast },
    { name: 'inner_border_stripped', image: innerBorderStripped },
    { name: 'inner_high_contrast', image: innerHighContrast },
    { name: 'tight_trim', image: tightTrim },
    { name: 'tight_trim_enlarged', image: tightTrimEnlarged },
  ]
}
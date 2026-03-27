import sharp from 'sharp'

export type PreprocessedVariant = {
  name: string
  image: Buffer
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
      width: 1600,
      withoutEnlargement: false,
    })
    .sharpen()
    .png()
    .toBuffer()

  const highContrast = await sharp(rotated)
    .grayscale()
    .linear(1.2, -10)
    .normalize()
    .sharpen()
    .png()
    .toBuffer()

  return [
    { name: 'original', image: rotated },
    { name: 'grayscale', image: grayscale },
    { name: 'threshold', image: threshold },
    { name: 'enlarged', image: enlarged },
    { name: 'high_contrast', image: highContrast },
  ]
}
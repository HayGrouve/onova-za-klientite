// Fails if a PWA icon the manifest or the page links to is missing or the wrong size.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const publicDir = join(import.meta.dirname, '..', 'public')
const manifest = JSON.parse(
  readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'),
)
let failed = false

const expectSize = async (file, size) => {
  try {
    const { width, height } = await sharp(join(publicDir, file)).metadata()
    if (width !== size || height !== size) {
      console.error(`${file}: ${width}×${height}, expected ${size}×${size}`)
      failed = true
    }
  } catch {
    console.error(`${file}: missing`)
    failed = true
  }
}

for (const icon of manifest.icons) {
  const [size] = icon.sizes.split('x').map(Number)
  await expectSize(icon.src.replace(/^\//, ''), size)
}
if (!manifest.icons.some((icon) => icon.purpose === 'maskable')) {
  console.error('manifest: no maskable icon')
  failed = true
}
await expectSize('apple-touch-icon.png', 180)
readFileSync(join(publicDir, 'favicon.ico'))

if (failed) process.exit(1)
console.log('PWA icons OK')

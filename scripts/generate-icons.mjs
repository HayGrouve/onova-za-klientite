// Writes the PWA icons from public/icon.svg and public/icon-maskable.svg.
// The maskable icon keeps its mark inside the central 80% safe zone.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const icon = readFileSync(join(publicDir, 'icon.svg'))
const maskable = readFileSync(join(publicDir, 'icon-maskable.svg'))

const outputs = [
  { file: 'icon-192.png', source: icon, size: 192 },
  { file: 'icon-512.png', source: icon, size: 512 },
  { file: 'icon-maskable-512.png', source: maskable, size: 512 },
  // iOS draws its own rounded corners, so it gets the full-bleed version.
  { file: 'apple-touch-icon.png', source: maskable, size: 180 },
]

for (const { file, source, size } of outputs) {
  await sharp(source, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(publicDir, file))
  console.log(`public/${file}`)
}

// favicon.ico holding one 32×32 PNG (ICO allows PNG payloads).
const png = await sharp(icon, { density: 300 }).resize(32, 32).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // one image
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt8(0, 8) // no palette
header.writeUInt8(0, 9) // reserved
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png.length, 14) // image size
header.writeUInt32LE(22, 18) // image offset
writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([header, png]))
console.log('public/favicon.ico')

/** The long side of an uploaded photo, in pixels (D18). */
const MAX_SIDE = 2000
const QUALITY = 0.82

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
}

function jpegName(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, '') || 'photo'
  return `${stem}.jpg`
}

/**
 * Shrinks a picked photo in the browser before upload (D18): JPEG, long side
 * at most 2000 px. Anything that is not an image (PDFs), cannot be decoded
 * here, or would not get smaller comes back unchanged.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    // JPEG has no transparency: paint white under transparent PNGs.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await toBlob(canvas)
    if (!blob || blob.size >= file.size) return file
    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

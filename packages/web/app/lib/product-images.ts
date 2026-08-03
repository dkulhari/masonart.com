/**
 * Admin media-row helpers (#368)
 *
 * Pure logic behind the ProductForm image rows: the type vocabulary offered to
 * the admin, exactly-one-`main` enforcement, drag reordering with contiguous
 * sortOrder, and the low-resolution source warning.
 */

import type { ImageCrop, ProductImageType } from '@chobii/shared'

/**
 * Sources whose long edge is under this are not upscaled by the pipeline
 * (`withoutEnlargement: true`) — they sit smaller on the mat. Warn before save.
 */
export const MIN_SOURCE_LONG_EDGE = 1200

/**
 * Types offered in the admin dropdown. `360-view` exists in the contract but is
 * produced by a separate pipeline, so it is not offered here.
 */
export const PRODUCT_IMAGE_TYPE_OPTIONS: ReadonlyArray<{
  value: ProductImageType
  label: string
}> = [
  { value: 'main', label: 'Main (matted artwork)' },
  { value: 'room-mockup', label: 'Room mockup' },
  { value: 'detail', label: 'Detail' },
  { value: 'texture', label: 'Texture' },
  { value: 'frame-preview', label: 'Frame preview' },
]

export const isLowResSource = (width: number, height: number): boolean =>
  Math.max(width, height) < MIN_SOURCE_LONG_EDGE

/** Rewrite sortOrder to array position, 0..n-1. */
export function renumberImages<T extends { sortOrder: number }>(
  images: readonly T[]
): T[] {
  return images.map((image, index) => ({ ...image, sortOrder: index }))
}

/** Move an item between positions and renumber contiguously from 0. */
export function reorderImages<T extends { sortOrder: number }>(
  images: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  const next = [...images]
  const [moved] = next.splice(fromIndex, 1)
  if (moved === undefined) return renumberImages([...images])
  next.splice(toIndex, 0, moved)
  return renumberImages(next)
}

/**
 * Set a row's type. Exactly one row may be `main`: promoting a row demotes the
 * previous `main` to `detail`.
 */
export function applyImageType<T extends { id: string; type: ProductImageType }>(
  images: readonly T[],
  id: string,
  type: ProductImageType
): T[] {
  return images.map((image) => {
    if (image.id === id) return { ...image, type }
    if (type === 'main' && image.type === 'main') {
      return { ...image, type: 'detail' as ProductImageType }
    }
    return image
  })
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/**
 * Convert react-easy-crop's `onCropComplete` percentage area to the contract's
 * normalised 0..1 rect, clamped against float drift at the edges.
 */
export function percentAreaToCropRect(area: {
  x: number
  y: number
  width: number
  height: number
}): ImageCrop {
  return {
    x: clamp01(area.x / 100),
    y: clamp01(area.y / 100),
    w: clamp01(area.width / 100),
    h: clamp01(area.height / 100),
  }
}

/**
 * The upload-image multipart body for one staged file. `crop` rides along only
 * for photographic types — `main` is matted, never cropped, and an unset crop
 * lets the backend default to the largest centred square.
 */
export function buildUploadFormData(
  pending: {
    file: File
    type: ProductImageType
    altText: string
    crop?: ImageCrop
  },
  sortOrder: number
): FormData {
  const body = new FormData()
  body.append('file', pending.file)
  body.append('type', pending.type)
  body.append('altText', pending.altText)
  body.append('sortOrder', String(sortOrder))
  if (pending.type !== 'main' && pending.crop) {
    body.append('crop', JSON.stringify(pending.crop))
  }
  return body
}

/**
 * Read a file's intrinsic pixel size in the browser. Used for the low-res
 * warning before the file is ever uploaded.
 */
export function readImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read image ${file.name}`))
    }
    image.src = url
  })
}

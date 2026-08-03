/**
 * ImageCropControl - chobii.art Admin
 *
 * Square pan/zoom crop viewport for photographic product media (#369). This is
 * what makes "never crop blindly" true: the backend crop is dumb and applies
 * whatever normalised rect it is handed, so a human chooses it here.
 *
 * `main` is matted (contained at MAT_ART_INSET) and never cropped, so it gets
 * a matted preview instead of a crop control.
 */

import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { MAT_ART_INSET, type ImageCrop, type ProductImageType } from '@chobii/shared'
import { percentAreaToCropRect } from '~/lib/product-images'

export interface ImageCropControlProps {
  type: ProductImageType
  imageUrl: string
  crop: ImageCrop | undefined
  onCropChange: (crop: ImageCrop) => void
}

export function ImageCropControl({ type, imageUrl, crop, onCropChange }: ImageCropControlProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  const handleCropComplete = useCallback(
    (croppedAreaPercentages: Area) => {
      onCropChange(percentAreaToCropRect(croppedAreaPercentages))
    },
    [onCropChange]
  )

  if (type === 'main') {
    return (
      <div
        data-testid="matted-preview"
        className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-mat"
      >
        <img
          src={imageUrl}
          alt="Matted preview"
          className="object-contain"
          style={{ width: `${MAT_ART_INSET * 100}%`, height: `${MAT_ART_INSET * 100}%` }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div data-testid="crop-viewport" className="relative aspect-square overflow-hidden rounded-md">
        <Cropper
          image={imageUrl}
          crop={position}
          zoom={zoom}
          aspect={1}
          onCropChange={setPosition}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
          initialCroppedAreaPercentages={
            crop
              ? { x: crop.x * 100, y: crop.y * 100, width: crop.w * 100, height: crop.h * 100 }
              : undefined
          }
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Zoom
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
        />
      </label>
    </div>
  )
}

export default ImageCropControl

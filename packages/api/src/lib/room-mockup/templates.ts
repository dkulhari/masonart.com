/**
 * Frame-render validation.
 *
 * `frame-renders.json` is hand-authored: a colour, a face width, a depth.
 * Every plausible mistake has to fail loudly and name the frame it came
 * from. A silent clamp or fallback would still produce an image, and a wrong
 * image that looks fine is far more expensive than a run that refuses to
 * start.
 *
 * The room scene itself (`room-<id>.json`) is validated in scene.ts.
 */

import { z } from 'zod';

export const frameRenderSchema = z.object({
  /**
   * Frame face width as a fraction of the art's short edge. 0 = frameless.
   * Used by the framed MAIN image (outputs.ts), which has no wall to give it
   * a physical scale.
   */
  widthRatio: z.number().min(0).max(0.5),
  color: z.tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
  ]),
  /**
   * How far the piece stands off the wall, same units as widthRatio. Mirrors
   * frames.thickness (inches) from the catalogue, restated as a ratio because
   * the main-image render needs a value relative to the image.
   *
   * Must be greater than zero: a frameless canvas has no face, so its shadow
   * is the ONLY cue for depth, and a zero here would flatten it completely.
   */
  depthRatio: z.number().gt(0).max(0.2),
  /**
   * Front face width in centimetres. The room scene is measured in cm, so
   * the face is drawn at its real size on the wall — 18 mm black, 32 mm oak —
   * rather than as a fraction of the art. 0 = gallery-wrap: no face, no mat,
   * art to the edge.
   */
  widthCm: z.number().min(0).max(12),
  /**
   * How far the piece stands off the wall, in centimetres. Drives the width
   * of the extruded side face and how far the shadow falls. Must be greater
   * than zero for the same reason as depthRatio.
   */
  depthCm: z.number().gt(0).max(12),
});

export interface FrameRender {
  widthRatio: number;
  color: [number, number, number];
  depthRatio: number;
  widthCm: number;
  depthCm: number;
}

export function loadFrames(rawFrames: unknown): Record<string, FrameRender> {
  const frameEntries = z.record(z.string(), z.unknown()).parse(rawFrames);
  const frames: Record<string, FrameRender> = {};

  for (const [slug, spec] of Object.entries(frameEntries)) {
    const parsed = frameRenderSchema.safeParse(spec);
    if (!parsed.success) {
      throw new Error(
        `Frame render "${slug}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }
    frames[slug] = parsed.data as FrameRender;
  }

  return frames;
}

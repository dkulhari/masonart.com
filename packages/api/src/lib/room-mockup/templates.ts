/**
 * Room template and frame-render validation.
 *
 * These two JSON files are hand-authored: someone measures a rectangle off a
 * screenshot and types four numbers. Every plausible mistake therefore has to
 * fail loudly and name the template it came from. A silent clamp or fallback
 * would still produce an image, and a wrong image that looks fine is far more
 * expensive than a run that refuses to start.
 */

import { z } from 'zod';
import type { Box } from './geometry';

const unit = z.number().min(0).max(1);

const placementSchema = z
  .object({
    x: unit,
    y: unit,
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((p) => p.x + p.w <= 1 && p.y + p.h <= 1, {
    message: 'placement must lie entirely inside the image',
  });

export const roomTemplateSchema = z.object({
  // The driver writes this straight into a filename (`room-${id}.jpg`), so a
  // stray "/" (a plausible typo next to the hyphenated ids elsewhere, e.g.
  // "living/room") would throw ENOENT partway through a poster, and a ".."
  // segment would write outside the output folder entirely. Same slug
  // convention as createProductSchema in routes/admin/products.ts.
  id: z.string().regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric with hyphens'),
  file: z.string().min(1),
  placement: placementSchema,
  light: z.enum(['left', 'right']),
  frame: z.string().min(1),
  label: z.string().min(1),
});

export interface RoomTemplate {
  id: string;
  file: string;
  placement: Box;
  light: 'left' | 'right';
  frame: string;
  label: string;
}

export const frameRenderSchema = z.object({
  /** Frame face width as a fraction of the art's short edge. 0 = frameless. */
  widthRatio: z.number().min(0).max(0.5),
  color: z.tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
  ]),
  /**
   * How far the piece stands off the wall, same units as widthRatio. Mirrors
   * frames.thickness (inches) from the catalogue, restated as a ratio because
   * this tool is offline and the render needs a value relative to the image.
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

export function loadTemplates(
  rawTemplates: unknown,
  rawFrames: unknown,
  fileExists: (file: string) => boolean
): { templates: RoomTemplate[]; frames: Record<string, FrameRender> } {
  const frames = loadFrames(rawFrames);

  const list = z.array(z.unknown()).parse(rawTemplates);
  if (list.length === 0) {
    throw new Error('No room templates defined — nothing to render.');
  }

  const templates: RoomTemplate[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of list.entries()) {
    const parsed = roomTemplateSchema.safeParse(entry);
    if (!parsed.success) {
      // The id may itself be the invalid field, so fall back to the index.
      const id =
        typeof entry === 'object' && entry !== null && 'id' in entry
          ? String((entry as { id: unknown }).id)
          : `#${index}`;
      throw new Error(
        `Room template "${id}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }

    const t = parsed.data as RoomTemplate;

    if (seen.has(t.id)) {
      throw new Error(`Room template "${t.id}" is declared more than once.`);
    }
    seen.add(t.id);

    if (!(t.frame in frames)) {
      throw new Error(
        `Room template "${t.id}" names frame "${t.frame}", which has no render spec.`
      );
    }

    if (!fileExists(t.file)) {
      throw new Error(`Room template "${t.id}" references a missing image: ${t.file}`);
    }

    templates.push(t);
  }

  return { templates, frames };
}

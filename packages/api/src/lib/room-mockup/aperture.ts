/**
 * Aperture mockups: the baked-frame fallback.
 *
 * The bare-wall pipeline (scene.ts + render.ts) draws its own frame and needs
 * a bare wall. Some rooms instead have a frame already in the photograph, with
 * an empty opening — the seed rooms are like this. There is nothing to draw
 * and nowhere to draw it: the poster is resampled straight into the measured
 * opening, its own thin mat keeping it off the baked frame's inner edge.
 *
 * This is deliberately the whole of it. No cm scale, no computed frame, no
 * side face, no shadow — those are baked into the photograph already, and
 * re-adding them would fight what is there. It reuses buildPanel and
 * warpPanelIntoQuad unchanged, which is the same pair the bare-wall route's
 * stage 3–4 use.
 */

import sharp from 'sharp';
import { z } from 'zod';
import { assertUsableQuad, type Quad } from './homography';
import { orientBuffer, orientFile } from './orient';
import { buildPanel, panelSizeForQuad, warpPanelIntoQuad } from './warp';

const unit = z.number().min(0).max(1);
const point = z.tuple([unit, unit]);

export const apertureTemplateSchema = z.object({
  // Slug: becomes part of the output filename, same rule as the scene id.
  id: z.string().regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric with hyphens'),
  image: z.string().min(1),
  imageSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  /** The frame's inner opening, normalised 0..1, wound tl → tr → br → bl. */
  quad: z.object({ tl: point, tr: point, br: point, bl: point }),
  mat: z.object({
    color: z.tuple([
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
    ]),
    /** Mat border as a fraction of the panel's short edge; buildPanel's 6% default if omitted. */
    ratio: z.number().min(0).max(0.4).optional(),
  }),
  label: z.string().min(1).optional(),
});

export interface ApertureTemplate {
  id: string;
  image: string;
  imageSize: [number, number];
  quad: Quad;
  mat: { color: [number, number, number]; ratio?: number };
  label: string;
}

export interface LoadApertureOptions {
  imageExists: (file: string) => boolean;
}

export function loadApertureTemplates(
  rawList: unknown[],
  opts: LoadApertureOptions
): ApertureTemplate[] {
  if (rawList.length === 0) {
    throw new Error('No aperture templates found — nothing to render.');
  }

  const seen = new Set<string>();
  const templates: ApertureTemplate[] = [];

  for (const raw of rawList) {
    const parsed = apertureTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      const id =
        typeof raw === 'object' && raw !== null && 'id' in raw
          ? String((raw as { id: unknown }).id)
          : '?';
      throw new Error(
        `Aperture template "${id}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }

    const d = parsed.data;
    const q = d.quad;
    const quad: Quad = [
      { x: q.tl[0], y: q.tl[1] },
      { x: q.tr[0], y: q.tr[1] },
      { x: q.br[0], y: q.br[1] },
      { x: q.bl[0], y: q.bl[1] },
    ];

    assertUsableQuad(quad, d.id);

    if (!opts.imageExists(d.image)) {
      throw new Error(`Aperture template "${d.id}" references a missing image: ${d.image}`);
    }

    if (seen.has(d.id)) {
      throw new Error(`Aperture template "${d.id}" is declared more than once.`);
    }
    seen.add(d.id);

    templates.push({
      id: d.id,
      image: d.image,
      imageSize: d.imageSize,
      quad,
      mat: { color: d.mat.color, ...(d.mat.ratio !== undefined ? { ratio: d.mat.ratio } : {}) },
      label: d.label ?? d.id,
    });
  }

  return templates;
}

export async function renderApertureMockup(
  art: Buffer,
  roomPath: string,
  template: ApertureTemplate
): Promise<Buffer> {
  const oriented = await orientBuffer(art);

  const roomBuf = await orientFile(roomPath);
  const rmeta = await sharp(roomBuf).metadata();
  const W = rmeta.width ?? 0;
  const H = rmeta.height ?? 0;

  if (W !== template.imageSize[0] || H !== template.imageSize[1]) {
    throw new Error(
      `Aperture template "${template.id}" declares imageSize ${template.imageSize.join('×')} but ${template.image} is ${W}×${H}; the quad was measured on a different image.`
    );
  }

  // Panel at the opening's own pixel extent (buildPanel already renders a 2x
  // panel internally is not the case here; warpPanelIntoQuad downsamples a
  // panel sized to the longer opposing edges, which is enough at this scale).
  const { width: pw, height: ph } = panelSizeForQuad(template.quad, W, H);
  const panel = await buildPanel(oriented, pw, ph, template.mat.color, template.mat.ratio);
  const layer = await warpPanelIntoQuad(panel, pw, ph, template.quad, W, H);

  return sharp(roomBuf)
    .composite([{ input: layer, raw: { width: W, height: H, channels: 4 }, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

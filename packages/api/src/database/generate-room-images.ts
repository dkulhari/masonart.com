/**
 * Stage 1 of the room mockup pipeline: generate the six bare-wall rooms.
 *
 * One-off and offline apart from the generator call. Writes `room-<id>.png`
 * and `room-<id>.prompt.txt` (the exact prompt, negative and model, kept as
 * provenance) into `src/database/room-templates/`. Measuring each room into
 * its `room-<id>.json` is the next step — see README.md in that folder.
 *
 * Uses the same Gemini SDK and key as src/ai/generator.ts but NOT that
 * module: it wraps every prompt in a poster style preset, which is exactly
 * what a room must not have.
 *
 * Usage:
 *   bun run mockups:generate-rooms [--only 03,04] [--force]
 *
 * Needs GOOGLE_AI_STUDIO_KEY (a billed key) in the environment. Without one
 * it refuses and points at PROMPT.md, which any licensed generator can take.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DEFAULT_ROOMS, roomPrompt } from '../lib/room-mockup/prompt';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'room-templates');

// Overridable for the same reason as GEMINI_MODELS in src/ai/generator.ts:
// Google retires image model ids without notice.
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

async function generate(prompt: string, negative: string, key: string): Promise<Buffer> {
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: MODEL,
    // Not yet in the SDK's types, same cast as generator.ts.
    generationConfig: { responseModalities: ['image', 'text'] } as never,
  });

  const result = await model.generateContent(`${prompt}\n\nDo not include: ${negative}.`);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData)?.inlineData;

  if (!image) {
    throw new Error(`Gemini (${MODEL}) returned no image part; response was text only.`);
  }
  return Buffer.from(image.data, 'base64');
}

function flagValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const key = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_AI_STUDIO_KEY is not set. Add a billed Google AI Studio key to .env, or generate ' +
        'the six rooms with another licensed tool using src/database/room-templates/PROMPT.md.'
    );
  }

  const only = flagValue('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const force = process.argv.includes('--force');

  mkdirSync(OUT, { recursive: true });

  for (const room of DEFAULT_ROOMS) {
    if (only && !only.includes(room.id)) continue;

    const target = join(OUT, `room-${room.id}.png`);
    if (existsSync(target) && !force) {
      console.log(`  room-${room.id}: exists, skipped (--force to regenerate)`);
      continue;
    }

    const { prompt, negative } = roomPrompt(room.yawDeg, room.variant);
    const png = await generate(prompt, negative, key);

    writeFileSync(target, png);
    writeFileSync(
      join(OUT, `room-${room.id}.prompt.txt`),
      `${prompt}\n\nNEGATIVE: ${negative}\nMODEL: ${MODEL}\nYAW: ${room.yawDeg}\n`
    );
    console.log(`  room-${room.id}: ${png.length} bytes (yaw ${room.yawDeg})`);
  }

  console.log(
    '\nNow measure each room with packages/api/tools/room-measure.html and save room-<id>.json next to it.'
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

/**
 * AI Generations Database Schema Tests
 *
 * Tests for ai_generations database table.
 * Validates schema structure, relationships, and CRUD operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import {
  users,
  aiGenerations,
} from '../../src/db/schema';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_dev';
  client = postgres(databaseUrl, { max: 1 });
  db = drizzle(client);

  await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Drop existing enums if they exist (for clean test state)
  await client`DROP TYPE IF EXISTS ai_generation_status CASCADE`;
  await client`DROP TYPE IF EXISTS ai_model CASCADE`;
  await client`DROP TYPE IF EXISTS aspect_ratio CASCADE`;
  await client`DROP TYPE IF EXISTS style_preset CASCADE`;
  await client`DROP TYPE IF EXISTS moderation_status CASCADE`;

  // Create enums
  await client`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'customer', 'trade'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await client`CREATE TYPE ai_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled')`;
  await client`CREATE TYPE ai_model AS ENUM ('sdxl', 'sd-2-1', 'dalle-3', 'midjourney', 'stable-diffusion-xl-lightning')`;
  await client`CREATE TYPE aspect_ratio AS ENUM ('1:1', '4:5', '3:4', '2:3', '4:3', '16:9', '21:9')`;
  await client`CREATE TYPE style_preset AS ENUM ('wabi-sabi', 'abstract-expression', 'botanical', 'vintage-poster', 'minimalist', 'geometric', 'watercolor', 'line-art', 'pop-art', 'surrealism')`;
  await client`CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'rejected', 'flagged')`;

  // Create tables
  await client`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      password_hash VARCHAR(255),
      role user_role NOT NULL DEFAULT 'customer',
      email_verified BOOLEAN NOT NULL DEFAULT false,
      phone_verified BOOLEAN NOT NULL DEFAULT false,
      avatar_url TEXT,
      preferences JSONB NOT NULL DEFAULT '{}',
      trade_account_status VARCHAR(50),
      trade_business JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS ai_generations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      prompt TEXT NOT NULL,
      enhanced_prompt TEXT,
      style_preset style_preset NOT NULL,
      aspect_ratio aspect_ratio NOT NULL,
      model ai_model NOT NULL DEFAULT 'sdxl',
      parameters JSONB,
      status ai_generation_status NOT NULL DEFAULT 'pending',
      images JSONB NOT NULL DEFAULT '[]',
      selected_image_id VARCHAR(255),
      moderation_status moderation_status NOT NULL DEFAULT 'pending',
      moderation_notes TEXT,
      moderated_by UUID REFERENCES users(id),
      moderated_at TIMESTAMP,
      error_message TEXT,
      processing_time_ms INTEGER,
      credits_used INTEGER,
      is_public BOOLEAN NOT NULL DEFAULT false,
      likes INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;
});

afterAll(async () => {
  await client`DROP TABLE IF EXISTS ai_generations CASCADE`;
  await client`DROP TABLE IF EXISTS users CASCADE`;
  await client`DROP TYPE IF EXISTS ai_generation_status CASCADE`;
  await client`DROP TYPE IF EXISTS ai_model CASCADE`;
  await client`DROP TYPE IF EXISTS aspect_ratio CASCADE`;
  await client`DROP TYPE IF EXISTS style_preset CASCADE`;
  await client`DROP TYPE IF EXISTS moderation_status CASCADE`;
  await client.end();
});

beforeEach(async () => {
  await client`DELETE FROM ai_generations`;
  await client`DELETE FROM users`;
});

describe('AI Generations Table Schema', () => {
  let testUserId: string;
  let testModeratorId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db.insert(users).values({
      email: 'ai-test@example.com',
      name: 'AI Test User',
      role: 'customer',
    }).returning();
    testUserId = user.id;

    // Create moderator
    const [moderator] = await db.insert(users).values({
      email: 'moderator@example.com',
      name: 'Moderator User',
      role: 'admin',
    }).returning();
    testModeratorId = moderator.id;
  });

  describe('Table Structure', () => {
    it('should have ai_generations table', async () => {
      const result = await client`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ai_generations'
      `;
      expect(result.length).toBe(1);
    });

    it('should have all required columns', async () => {
      const result = await client`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ai_generations'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('prompt');
      expect(columnNames).toContain('style_preset');
      expect(columnNames).toContain('aspect_ratio');
      expect(columnNames).toContain('model');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('images');
      expect(columnNames).toContain('moderation_status');
      expect(columnNames).toContain('is_public');
      expect(columnNames).toContain('likes');
      expect(columnNames).toContain('views');
    });

    it('should have foreign key to users', async () => {
      const result = await client`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'ai_generations' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AI Generation CRUD Operations', () => {
    it('should insert an AI generation', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'A beautiful abstract painting in wabi-sabi style',
        stylePreset: 'wabi-sabi',
        aspectRatio: '4:5',
        model: 'sdxl',
        status: 'pending',
      }).returning();

      expect(result).toHaveProperty('id');
      expect(result.userId).toBe(testUserId);
      expect(result.prompt).toBe('A beautiful abstract painting in wabi-sabi style');
      expect(result.stylePreset).toBe('wabi-sabi');
      expect(result.status).toBe('pending');
    });

    it('should select AI generations', async () => {
      await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Test prompt',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'pending',
      });

      const result = await db.select().from(aiGenerations).where(eq(aiGenerations.userId, testUserId));
      expect(result).toHaveLength(1);
    });

    it('should update generation status', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Update test',
        stylePreset: 'pop-art',
        aspectRatio: '16:9',
        model: 'sdxl',
        status: 'pending',
      }).returning();

      await db.update(aiGenerations)
        .set({ status: 'processing' })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.status).toBe('processing');
    });

    it('should delete a generation', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Delete test',
        stylePreset: 'watercolor',
        aspectRatio: '3:4',
        model: 'sdxl',
        status: 'pending',
      }).returning();

      await db.delete(aiGenerations).where(eq(aiGenerations.id, inserted.id));

      const result = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result).toHaveLength(0);
    });
  });

  describe('Generation Status Workflow', () => {
    it('should support all generation statuses', async () => {
      const statuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

      for (const status of statuses) {
        const [result] = await db.insert(aiGenerations).values({
          userId: testUserId,
          prompt: `Test prompt for ${status}`,
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: 'sdxl',
          status: status as any,
        }).returning();

        expect(result.status).toBe(status);
        await db.delete(aiGenerations).where(eq(aiGenerations.id, result.id));
      }
    });

    it('should update status from pending to processing', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Status workflow test',
        stylePreset: 'botanical',
        aspectRatio: '4:5',
        model: 'sdxl',
        status: 'pending',
      }).returning();

      await db.update(aiGenerations)
        .set({ status: 'processing' })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.status).toBe('processing');
    });

    it('should set completed status with completion timestamp', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Completion test',
        stylePreset: 'geometric',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'processing',
      }).returning();

      const completedAt = new Date();

      await db.update(aiGenerations)
        .set({
          status: 'completed',
          completedAt,
          processingTimeMs: 5000,
        })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
      expect(result.processingTimeMs).toBe(5000);
    });
  });

  describe('Style Presets', () => {
    it('should support all style presets', async () => {
      const styles = ['wabi-sabi', 'abstract-expression', 'botanical', 'vintage-poster', 'minimalist',
                      'geometric', 'watercolor', 'line-art', 'pop-art', 'surrealism'];

      for (const style of styles) {
        const [result] = await db.insert(aiGenerations).values({
          userId: testUserId,
          prompt: `Test prompt in ${style} style`,
          stylePreset: style as any,
          aspectRatio: '1:1',
          model: 'sdxl',
          status: 'pending',
        }).returning();

        expect(result.stylePreset).toBe(style);
        await db.delete(aiGenerations).where(eq(aiGenerations.id, result.id));
      }
    });
  });

  describe('Aspect Ratios', () => {
    it('should support all aspect ratios', async () => {
      const ratios = ['1:1', '4:5', '3:4', '2:3', '4:3', '16:9', '21:9'];

      for (const ratio of ratios) {
        const [result] = await db.insert(aiGenerations).values({
          userId: testUserId,
          prompt: 'Test prompt',
          stylePreset: 'minimalist',
          aspectRatio: ratio as any,
          model: 'sdxl',
          status: 'pending',
        }).returning();

        expect(result.aspectRatio).toBe(ratio);
        await db.delete(aiGenerations).where(eq(aiGenerations.id, result.id));
      }
    });
  });

  describe('AI Models', () => {
    it('should support all AI models', async () => {
      const models = ['sdxl', 'sd-2-1', 'dalle-3', 'midjourney', 'stable-diffusion-xl-lightning'];

      for (const model of models) {
        const [result] = await db.insert(aiGenerations).values({
          userId: testUserId,
          prompt: `Test prompt for ${model}`,
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: model as any,
          status: 'pending',
        }).returning();

        expect(result.model).toBe(model);
        await db.delete(aiGenerations).where(eq(aiGenerations.id, result.id));
      }
    });

    it('should default to sdxl model', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Default model test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        status: 'pending',
      }).returning();

      expect(result.model).toBe('sdxl');
    });
  });

  describe('Generation Parameters', () => {
    it('should store generation parameters as JSON', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Parameters test',
        stylePreset: 'surrealism',
        aspectRatio: '4:5',
        model: 'sdxl',
        status: 'pending',
        parameters: {
          cfgScale: 7.5,
          steps: 50,
          sampler: 'euler_a',
          seed: 12345,
          negativePrompt: 'ugly, blurry, low quality',
        },
      }).returning();

      expect(result.parameters).toBeDefined();
      expect(result.parameters?.cfgScale).toBe(7.5);
      expect(result.parameters?.steps).toBe(50);
      expect(result.parameters?.sampler).toBe('euler_a');
    });
  });

  describe('Generated Images', () => {
    it('should store generated images as JSON array', async () => {
      const testImages = [
        {
          url: 'https://example.com/gen1.jpg',
          width: 1024,
          height: 1280,
          isSelected: true,
          thumbnailUrl: 'https://example.com/gen1-thumb.jpg',
        },
        {
          url: 'https://example.com/gen2.jpg',
          width: 1024,
          height: 1280,
          isSelected: false,
        },
      ];

      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Images test',
        stylePreset: 'watercolor',
        aspectRatio: '4:5',
        model: 'sdxl',
        status: 'completed',
        images: testImages,
      }).returning();

      expect(result.images).toHaveLength(2);
      expect(result.images[0].isSelected).toBe(true);
      expect(result.images[0].thumbnailUrl).toBe('https://example.com/gen1-thumb.jpg');
    });

    it('should default to empty images array', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Empty images test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'pending',
      }).returning();

      expect(result.images).toEqual([]);
    });
  });

  describe('Moderation', () => {
    it('should support all moderation statuses', async () => {
      const statuses = ['pending', 'approved', 'rejected', 'flagged'];

      for (const status of statuses) {
        const [result] = await db.insert(aiGenerations).values({
          userId: testUserId,
          prompt: 'Moderation test',
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: 'sdxl',
          status: 'completed',
          moderationStatus: status as any,
        }).returning();

        expect(result.moderationStatus).toBe(status);
        await db.delete(aiGenerations).where(eq(aiGenerations.id, result.id));
      }
    });

    it('should default to pending moderation status', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Default moderation test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
      }).returning();

      expect(result.moderationStatus).toBe('pending');
    });

    it('should store moderation information', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Moderation info test',
        stylePreset: 'pop-art',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        moderationStatus: 'pending',
      }).returning();

      const moderatedAt = new Date();

      await db.update(aiGenerations)
        .set({
          moderationStatus: 'approved',
          moderatedBy: testModeratorId,
          moderatedAt,
          moderationNotes: 'Image approved - appropriate content',
        })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.moderationStatus).toBe('approved');
      expect(result.moderatedBy).toBe(testModeratorId);
      expect(result.moderatedAt).toBeDefined();
      expect(result.moderationNotes).toBe('Image approved - appropriate content');
    });
  });

  describe('Public/Private Generations', () => {
    it('should default to private (is_public = false)', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Private test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
      }).returning();

      expect(result.isPublic).toBe(false);
    });

    it('should support public generations', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Public test',
        stylePreset: 'abstract-expression',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        isPublic: true,
      }).returning();

      expect(result.isPublic).toBe(true);
    });

    it('should filter public generations', async () => {
      await db.insert(aiGenerations).values([
        {
          userId: testUserId,
          prompt: 'Public 1',
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: 'sdxl',
          status: 'completed',
          isPublic: true,
        },
        {
          userId: testUserId,
          prompt: 'Private 1',
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: 'sdxl',
          status: 'completed',
          isPublic: false,
        },
        {
          userId: testUserId,
          prompt: 'Public 2',
          stylePreset: 'minimalist',
          aspectRatio: '1:1',
          model: 'sdxl',
          status: 'completed',
          isPublic: true,
        },
      ]);

      const publicGens = await db.select().from(aiGenerations).where(eq(aiGenerations.isPublic, true));
      expect(publicGens).toHaveLength(2);
    });
  });

  describe('Likes and Views', () => {
    it('should default to 0 likes and views', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Likes/views test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
      }).returning();

      expect(result.likes).toBe(0);
      expect(result.views).toBe(0);
    });

    it('should increment likes', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Likes increment test',
        stylePreset: 'botanical',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        isPublic: true,
      }).returning();

      await db.update(aiGenerations)
        .set({ likes: 10 })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.likes).toBe(10);
    });

    it('should increment views', async () => {
      const [inserted] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Views increment test',
        stylePreset: 'vintage-poster',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        isPublic: true,
      }).returning();

      await db.update(aiGenerations)
        .set({ views: 100 })
        .where(eq(aiGenerations.id, inserted.id));

      const [result] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, inserted.id));
      expect(result.views).toBe(100);
    });
  });

  describe('Credits and Processing Time', () => {
    it('should store credits used', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Credits test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        creditsUsed: 5,
      }).returning();

      expect(result.creditsUsed).toBe(5);
    });

    it('should store processing time in milliseconds', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Processing time test',
        stylePreset: 'line-art',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'completed',
        processingTimeMs: 8500,
      }).returning();

      expect(result.processingTimeMs).toBe(8500);
    });
  });

  describe('Error Handling', () => {
    it('should store error messages for failed generations', async () => {
      const [result] = await db.insert(aiGenerations).values({
        userId: testUserId,
        prompt: 'Error test',
        stylePreset: 'minimalist',
        aspectRatio: '1:1',
        model: 'sdxl',
        status: 'failed',
        errorMessage: 'Generation failed: API timeout',
      }).returning();

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Generation failed: API timeout');
    });
  });
});

-- One-time rewrite of stored absolute CDN URLs for the chobii.art cutover
-- (chobii-cdn.xtoms.xyz -> cdn.chobii.art). Run AFTER the Phase 2 deploy is
-- verified. Safe to run repeatedly (idempotent); reversible by swapping the
-- replace() arguments. Take a pg_dump first regardless.
--
-- Usage (from the dev machine):
--   ssh dhruv@<mini> "export PATH=/opt/homebrew/bin:\$PATH; \
--     docker compose -f ~/chobii-docker-compose.yml exec -T postgres \
--     psql -U chobii -d chobii" < deploy/cutover-cdn-url-rewrite.sql
--
-- Scope is exhaustive as of 2026-07-24: orders/cart/reviews/returns snapshot
-- no image URLs. New uploads already use cdn.chobii.art via CDN_URL.

-- Pre-counts (record these; post-run they must all be 0)
SELECT 'products' AS t, count(*) FROM products
  WHERE images::text LIKE '%chobii-cdn.xtoms.xyz%'
UNION ALL
SELECT 'ai_generations', count(*) FROM ai_generations
  WHERE images::text LIKE '%chobii-cdn.xtoms.xyz%'
     OR selected_image_url LIKE '%chobii-cdn.xtoms.xyz%'
UNION ALL
SELECT 'approval_photos', count(*) FROM approval_photos
  WHERE url LIKE '%chobii-cdn.xtoms.xyz%'
     OR thumbnail_url LIKE '%chobii-cdn.xtoms.xyz%'
UNION ALL
SELECT 'frames', count(*) FROM frames
  WHERE image_url LIKE '%chobii-cdn.xtoms.xyz%'
     OR thumbnail_url LIKE '%chobii-cdn.xtoms.xyz%'
UNION ALL
SELECT 'user', count(*) FROM "user"
  WHERE image LIKE '%chobii-cdn.xtoms.xyz%';

BEGIN;

UPDATE products SET images =
  replace(images::text, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')::jsonb
  WHERE images::text LIKE '%chobii-cdn.xtoms.xyz%';

UPDATE ai_generations SET
  images = replace(images::text, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')::jsonb,
  selected_image_url = replace(selected_image_url, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')
  WHERE images::text LIKE '%chobii-cdn.xtoms.xyz%'
     OR selected_image_url LIKE '%chobii-cdn.xtoms.xyz%';

UPDATE approval_photos SET
  url = replace(url, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/'),
  thumbnail_url = replace(thumbnail_url, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')
  WHERE url LIKE '%chobii-cdn.xtoms.xyz%'
     OR thumbnail_url LIKE '%chobii-cdn.xtoms.xyz%';

UPDATE frames SET
  image_url = replace(image_url, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/'),
  thumbnail_url = replace(thumbnail_url, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')
  WHERE image_url LIKE '%chobii-cdn.xtoms.xyz%'
     OR thumbnail_url LIKE '%chobii-cdn.xtoms.xyz%';

UPDATE "user" SET
  image = replace(image, 'https://chobii-cdn.xtoms.xyz/', 'https://cdn.chobii.art/')
  WHERE image LIKE '%chobii-cdn.xtoms.xyz%';

COMMIT;

-- Post-check: rerun the pre-count query above; every row must show 0.

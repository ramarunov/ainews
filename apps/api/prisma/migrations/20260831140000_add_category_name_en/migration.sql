-- English label for the parallel /en/ edition. Null = fall back to `name`
-- (the Indonesian label) on the English side too.
ALTER TABLE "categories" ADD COLUMN "nameEn" VARCHAR(255);

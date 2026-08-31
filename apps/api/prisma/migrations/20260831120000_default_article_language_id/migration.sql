-- Every article on this deployment is the Indonesian edition. The schema's
-- generic default of 'en' (authored before this became a single-market
-- Indonesian site) meant every row was created with language = 'en', which
-- is only now visible because the public API started filtering by language
-- for the new /en/* translation edition. Backfill those rows to 'id' and
-- flip the column default, so 'en' from here on only ever comes from a
-- translation job that sets it explicitly.
UPDATE "articles" SET "language" = 'id' WHERE "language" = 'en';
ALTER TABLE "articles" ALTER COLUMN "language" SET DEFAULT 'id';

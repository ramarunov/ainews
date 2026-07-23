-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "metaTitle" VARCHAR(255),
    "metaDescription" VARCHAR(500),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_organizationId_slug_key" ON "pages"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "pages_organizationId_idx" ON "pages"("organizationId");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: carry over the "Tentang Kami"/About Us content that used
-- to be hardcoded in apps/web/app/(public)/about/page.tsx, so existing
-- deployments keep the same public content once that page starts reading
-- from this table instead. ON CONFLICT DO NOTHING makes this safely
-- re-runnable and a no-op for any org that already has an "about" page.
INSERT INTO "pages" ("id", "organizationId", "slug", "title", "content", "metaTitle", "metaDescription", "isPublished", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    o."id",
    'about',
    'Tentang Kami',
    '<p>Berita lebih cepat, dipahami lebih mudah.</p>' ||
    '<h2>Tentang BeritaBot.com</h2>' ||
    '<p>BeritaBot.com adalah media berita digital yang menggabungkan teknologi AI dengan pengawasan editorial manusia. Kami percaya kecepatan menyampaikan berita tidak boleh mengorbankan akurasi maupun tanggung jawab jurnalistik.</p>' ||
    '<h2>Kebijakan Redaksi &amp; Penggunaan AI</h2>' ||
    '<p>Sebagian artikel di BeritaBot.com dibantu proses penulisannya menggunakan kecerdasan buatan (AI) untuk merangkum dan menyusun draf awal dari berbagai sumber berita. AI di sini hanya berperan sebagai alat bantu &mdash; setiap artikel tetap wajib ditinjau dan disetujui oleh redaksi manusia sebelum tayang. Tanggung jawab atas keakuratan dan kepatutan setiap berita yang terbit tetap berada di tangan redaksi, bukan sistem otomatis.</p>' ||
    '<p>Artikel yang proses penulisannya dibantu AI diberi label <mark>AI-assisted</mark> pada halaman artikel terkait.</p>' ||
    '<h2>Kebijakan Koreksi</h2>' ||
    '<p>Kami berkomitmen menyajikan berita yang akurat. Jika Anda menemukan kesalahan pada artikel kami &mdash; baik faktual, ejaan, maupun konteks &mdash; silakan hubungi kami melalui email di bawah dengan menyertakan tautan artikel dan penjelasan singkat. Setiap koreksi yang valid akan kami tinjau dan perbaiki, dengan waktu pembaruan artikel yang tercatat jelas pada artikel terkait.</p>' ||
    '<h2>Kepemilikan &amp; Pendanaan</h2>' ||
    '<p>BeritaBot.com dikelola secara independen. Untuk pertanyaan terkait kepemilikan, pendanaan, atau kerja sama, silakan hubungi kami melalui email di bawah.</p>' ||
    '<h2>Kontak Redaksi</h2>' ||
    '<p>Email: <a href="mailto:support@beritabot.com">support@beritabot.com</a></p>',
    'Tentang Kami — BeritaBot.com',
    'Tentang BeritaBot.com, kebijakan redaksi dan penggunaan AI, kebijakan koreksi, dan cara menghubungi redaksi.',
    true,
    now(),
    now()
FROM "organizations" o
ON CONFLICT ("organizationId", "slug") DO NOTHING;

-- Grant the new pages:* permissions to existing Admin/Editor system roles
-- (new organizations already get these via DEFAULT_ROLES at creation time -
-- see apps/api/src/common/constants/default-roles.ts - this backfills
-- orgs/roles that already existed before this migration ran). Guarded by
-- NOT already containing 'pages:read' so this is safely re-runnable.
UPDATE "roles"
SET "permissions" = "permissions" || ARRAY['pages:read', 'pages:write', 'pages:delete']::text[]
WHERE "slug" IN ('admin', 'editor')
  AND "isSystem" = true
  AND NOT ('pages:read' = ANY("permissions"));

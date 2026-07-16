import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { GeoService } from '../src/modules/geo/geo.service';
import { runWithOrgContext } from '../src/infrastructure/prisma/org-context';

// One-time backfill for articles published before semantic search existed -
// GeoService.onArticlePublished only ever runs on an article's first
// PUBLISHED transition, so anything published before this feature shipped
// has no article_geo.contentEmbedding at all. Safe to re-run: only
// articles genuinely missing an embedding are selected each time.
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const prisma = app.get(PrismaService);
  const geoService = app.get(GeoService);

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let processed = 0;
  let failed = 0;

  for (const org of organizations) {
    await runWithOrgContext(org.id, async () => {
      const rows = await prisma.$queryRaw<Array<{ id: string; title: string; content: string }>>`
        SELECT a.id, a.title, a.content
        FROM articles a
        LEFT JOIN article_geo g ON g."articleId" = a.id
        WHERE a."organizationId" = ${org.id}::uuid
          AND a.status = 'PUBLISHED'
          AND a."deletedAt" IS NULL
          AND (g.id IS NULL OR g."contentEmbedding" IS NULL)
      `;

      if (rows.length === 0) return;
      console.log(`${org.name}: backfilling ${rows.length} article(s)...`);

      for (const row of rows) {
        try {
          // generateAndStoreEmbedding UPDATEs an existing article_geo row -
          // make sure one exists, without forcing a full (AI-costly) GEO
          // score recalculation for articles that never got one.
          await prisma.articleGeo.upsert({
            where: { articleId: row.id },
            create: { articleId: row.id },
            update: {},
          });
          await geoService.generateAndStoreEmbedding(row.id, row.title, row.content);
          processed++;
        } catch (err) {
          failed++;
          console.error(`Failed to embed article ${row.id} ("${row.title}"):`, err);
        }
      }
    });
  }

  console.log(`Done. Embedded ${processed} article(s), ${failed} failure(s).`);
  await app.close();
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

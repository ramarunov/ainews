import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

// One-time backfill for User.slug (added by the
// 20260825150000_add_user_slug migration) - every user created before that
// migration has slug = null, which means their public author page is only
// reachable at /author/{id} (see PublicSiteService.getAuthorProfile's id
// fallback). This assigns each of them the same slug UsersService.create()
// would generate today, so /author/{slug} starts working for pre-existing
// authors too. Safe to re-run: only touches users where slug IS NULL.
//
// Deliberately a raw PrismaClient, not the full NestJS AppModule (unlike
// scripts/backfill-article-schema.ts) - this only needs the DB, and
// bootstrapping AppModule pulls in BullMQ/OpenSearch/etc. that this script
// has no other reason to depend on. RLS still applies to the `users` table
// (see infrastructure/prisma/rls-extension.ts), so each org's rows are read
// and written inside a transaction with `app.current_org_id` set manually,
// the same GUC that extension sets per-request.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

(async () => {
  const prisma = new PrismaClient();
  let updated = 0;

  try {
    const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

    for (const org of organizations) {
      if (!UUID_RE.test(org.id)) continue;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${org.id}'`);

        const users = await tx.user.findMany({
          where: { organizationId: org.id, slug: null },
          select: { id: true, displayName: true, firstName: true, lastName: true },
          orderBy: { createdAt: 'asc' },
        });

        if (users.length === 0) return;
        console.log(`${org.name}: ${users.length} user(s) without a slug`);

        for (const user of users) {
          const name = user.displayName?.trim() || `${user.firstName} ${user.lastName}`.trim();
          const base = (slugify(name, { lower: true, strict: true, trim: true }) || 'author').substring(
            0,
            200,
          );

          let slug = base;
          let counter = 1;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const existing = await tx.user.findFirst({
              where: { organizationId: org.id, slug, id: { not: user.id } },
            });
            if (!existing) break;
            slug = `${base}-${counter++}`;
          }

          await tx.user.update({ where: { id: user.id }, data: { slug } });
          updated++;
        }
      }, { timeout: 30_000 });
    }

    console.log(`Done. updated=${updated}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

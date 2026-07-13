/**
 * Real integration test against a live Postgres — the first of its kind in
 * this project (every other spec mocks Prisma). Requires the dev-stack
 * Postgres container to be running with DATABASE_URL (ainews_app, the
 * non-superuser runtime role) and DIRECT_DATABASE_URL (ainews, the
 * superuser used only here to set up/tear down fixtures) set in .env.
 *
 * Run with: pnpm test:integration
 *
 * This exists to prove the actual security property RLS is for: that
 * tenant isolation holds at the DATABASE level, independent of whether any
 * particular application code path remembers to add `where: {
 * organizationId }`. Every test below deliberately queries WITHOUT an
 * organizationId filter — the whole point is to show Postgres itself
 * refuses to return another tenant's rows even when the app-level query
 * doesn't ask it to.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  createRlsExtendedClient,
  withOrgTransaction,
} from '../src/infrastructure/prisma/rls-extension';
import { runWithOrgContext } from '../src/infrastructure/prisma/org-context';

describe('Row-Level Security: tenant isolation (real Postgres)', () => {
  const admin = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });
  const appClient = createRlsExtendedClient(new PrismaClient());

  let orgA: { id: string };
  let orgB: { id: string };
  let userA: { id: string };
  let userB: { id: string };
  let articleA: { id: string };
  let articleB: { id: string };

  beforeAll(async () => {
    orgA = await admin.organization.create({
      data: { name: `RLS Test Org A ${randomUUID()}`, slug: `rls-test-a-${randomUUID()}` },
    });
    orgB = await admin.organization.create({
      data: { name: `RLS Test Org B ${randomUUID()}`, slug: `rls-test-b-${randomUUID()}` },
    });
    userA = await admin.user.create({
      data: {
        organizationId: orgA.id,
        email: `rls-test-a-${randomUUID()}@example.com`,
        firstName: 'RLS',
        lastName: 'TestA',
      },
    });
    userB = await admin.user.create({
      data: {
        organizationId: orgB.id,
        email: `rls-test-b-${randomUUID()}@example.com`,
        firstName: 'RLS',
        lastName: 'TestB',
      },
    });
    articleA = await admin.article.create({
      data: {
        organizationId: orgA.id,
        primaryAuthorId: userA.id,
        title: 'Org A secret article',
        slug: `org-a-secret-${randomUUID()}`,
        content: 'only org A should ever see this',
      },
    });
    articleB = await admin.article.create({
      data: {
        organizationId: orgB.id,
        primaryAuthorId: userB.id,
        title: 'Org B secret article',
        slug: `org-b-secret-${randomUUID()}`,
        content: 'only org B should ever see this',
      },
    });
  });

  afterAll(async () => {
    await admin.article.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await admin.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await admin.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await admin.$disconnect();
    await appClient.$disconnect();
  });

  it('sanity check: the fixture articles actually exist (via the superuser connection)', async () => {
    const articles = await admin.article.findMany({
      where: { id: { in: [articleA.id, articleB.id] } },
    });
    expect(articles).toHaveLength(2);
  });

  it('denies all rows when no org context is set — fail closed, not fail open', async () => {
    const articles = await appClient.article.findMany({
      where: { id: { in: [articleA.id, articleB.id] } },
    });
    expect(articles).toHaveLength(0);
  });

  it('shows only Org A the article that belongs to Org A, with no app-level filter at all', async () => {
    const articles = await runWithOrgContext(orgA.id, () =>
      appClient.article.findMany({ where: { id: { in: [articleA.id, articleB.id] } } }),
    );
    expect(articles.map((a) => a.id)).toEqual([articleA.id]);
  });

  it('shows only Org B the article that belongs to Org B, with no app-level filter at all', async () => {
    const articles = await runWithOrgContext(orgB.id, () =>
      appClient.article.findMany({ where: { id: { in: [articleA.id, articleB.id] } } }),
    );
    expect(articles.map((a) => a.id)).toEqual([articleB.id]);
  });

  it('enforces isolation even for a raw SQL query — proving this is DB-level, not query-builder-level', async () => {
    const rows = await runWithOrgContext(orgA.id, () =>
      appClient.$queryRawUnsafe<{ id: string }[]>(
        'SELECT id FROM articles WHERE id = ANY($1::uuid[])',
        [articleA.id, articleB.id],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(articleA.id);
  });

  it('supports the tagged-template $queryRaw form too, not just $queryRawUnsafe', async () => {
    // Regression test: $queryRaw (tagged template) passes a single Sql
    // object as `args`, not a positional array like $queryRawUnsafe —
    // spreading it unconditionally (an earlier version of the extension
    // did) throws "Spread syntax requires ...iterable[Symbol.iterator] to
    // be a function". Caught via AnalyticsService's dashboard query
    // (which uses this exact tagged-template form) 500ing in live testing.
    const rows = await runWithOrgContext(
      orgA.id,
      () => appClient.$queryRaw<{ id: string }[]>`SELECT id FROM articles WHERE id = ${articleA.id}::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(articleA.id);
  });

  it('blocks an insert that claims the wrong organizationId for the active context (WITH CHECK)', async () => {
    await expect(
      runWithOrgContext(orgA.id, () =>
        appClient.article.create({
          data: {
            organizationId: orgB.id, // mismatched on purpose
            primaryAuthorId: userA.id,
            title: 'Should never be allowed to write',
            slug: `should-fail-${randomUUID()}`,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('still isolates correctly inside an explicit multi-step transaction (withOrgTransaction)', async () => {
    const articles = await runWithOrgContext(orgB.id, () =>
      withOrgTransaction<{ id: string }[]>(appClient, (tx) =>
        tx.article.findMany({ where: { id: { in: [articleA.id, articleB.id] } } }),
      ),
    );
    expect(articles.map((a) => a.id)).toEqual([articleB.id]);
  });

  it('reverting to no context after a prior transaction does not error or leak rows (the empty-string GUC bug)', async () => {
    await runWithOrgContext(orgA.id, () => appClient.article.findMany());

    const articles = await appClient.article.findMany({
      where: { id: { in: [articleA.id, articleB.id] } },
    });
    expect(articles).toHaveLength(0);
  });
});

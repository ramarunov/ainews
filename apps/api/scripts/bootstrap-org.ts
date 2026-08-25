import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_ROLES } from '../src/common/constants/default-roles';

// Bootstraps a real (non-"demo") Organization + admin user for a new
// deployment - e.g. a WordPress-migration site like rusdimedia.com, which
// gets its own server/database entirely (see deploy/rusdimedia/README.md).
// prisma/seed.ts is deliberately left alone for this: it's the fixed local-
// dev/first-run fixture ("Demo Organization", hardcoded admin@demo.local)
// documented in docs/DEPLOY.md §9 and reused by e2e tests - hardcoding a
// second organization's real name/admin email into that same script would
// make every future migration mean editing shared code. This script takes
// everything as env vars instead, so it's reusable as-is for the next one.
//
// Required env vars: ORG_NAME, ORG_SLUG, ADMIN_EMAIL, ADMIN_PASSWORD,
// ADMIN_FIRST_NAME, ADMIN_LAST_NAME. Safe to re-run (upserts throughout,
// same as seed.ts) - e.g. to pick up a DEFAULT_ROLES change without
// duplicating roles.
const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required - set it in the environment before running this script.`);
  }
  return value;
}

async function main() {
  const orgName = requireEnv('ORG_NAME');
  const orgSlug = requireEnv('ORG_SLUG');
  const adminEmail = requireEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const adminFirstName = requireEnv('ADMIN_FIRST_NAME');
  const adminLastName = requireEnv('ADMIN_LAST_NAME');

  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: { name: orgName },
    create: { name: orgName, slug: orgSlug },
  });

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: role.slug } },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
      },
      create: {
        organizationId: org.id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }

  const adminRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: org.id, slug: 'admin' },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const displayName = `${adminFirstName} ${adminLastName}`;

  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: adminEmail } },
    update: { isSuperadmin: true },
    create: {
      organizationId: org.id,
      email: adminEmail,
      passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      displayName,
      isActive: true,
      isSuperadmin: true,
      // Mirrors UsersService.generateSlug so this admin's own /author/{slug}
      // page works immediately, without needing a separate backfill run
      // for a brand-new org that only has this one user so far.
      slug: adminFirstName.toLowerCase() + '-' + adminLastName.toLowerCase(),
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  console.log(`Organization: "${org.name}" (slug: ${org.slug})`);
  console.log(`Organization ID (set as PUBLIC_SITE_ORG_ID): ${org.id}`);
  console.log(`Roles created: ${DEFAULT_ROLES.map((r) => r.slug).join(', ')}`);
  console.log(`Admin login: ${adminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

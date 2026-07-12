import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_ROLES } from '../src/common/constants/default-roles';

const prisma = new PrismaClient();

async function main() {
  const orgSlug = 'demo';

  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: orgSlug,
    },
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

  const adminEmail = 'admin@demo.local';
  const adminPassword = 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: adminEmail } },
    // isSuperadmin also set on update so re-running the seed against a DB
    // created before this flag existed still grants it to the demo admin.
    update: { isSuperadmin: true },
    create: {
      organizationId: org.id,
      email: adminEmail,
      passwordHash,
      firstName: 'Demo',
      lastName: 'Admin',
      displayName: 'Demo Admin',
      isActive: true,
      isSuperadmin: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  console.log(`Seeded organization "${org.name}" (slug: ${org.slug})`);
  console.log(`Roles created: ${DEFAULT_ROLES.map((r) => r.slug).join(', ')}`);
  console.log(`Demo admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

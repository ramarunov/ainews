import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

// Draft subcategory taxonomy for topical authority (see docs discussion) -
// keyed by the parent category's slug so this only ever touches an org's
// *existing* main categories, never invents new top-level ones. Every
// subcategory is created with subdomain left null (it inherits its
// parent's subdomain and lives at a path underneath it - see
// getCategoryUrl in lib/site-url.ts / site-url.util.ts).
const SUBCATEGORIES: Record<string, string[]> = {
  dunia: ['Asia', 'Amerika', 'Eropa', 'Timur Tengah', 'Afrika', 'Konflik & Keamanan'],
  kesehatan: ['Gizi & Nutrisi', 'Kebugaran', 'Penyakit & Pengobatan', 'Kesehatan Mental', 'Ibu & Anak'],
  olahraga: ['Sepak Bola', 'Bulu Tangkis', 'Basket', 'MotoGP & F1', 'Esports'],
  teknologi: ['Gadget', 'Aplikasi & Software', 'Kecerdasan Buatan', 'Internet & Medsos', 'Startup'],
  lifestyle: ['Kuliner', 'Fashion & Kecantikan', 'Travel', 'Hubungan & Keluarga', 'Tren Gaya Hidup'],
  bisnis: ['Ekonomi', 'Saham & Investasi', 'UMKM', 'Properti', 'Keuangan Pribadi'],
  pendidikan: ['Sekolah', 'Perguruan Tinggi', 'Beasiswa', 'Karier', 'Pendidikan Anak'],
  politik: ['Pemerintahan', 'DPR & Legislasi', 'Pemilu & Pilkada', 'Partai Politik', 'Hukum'],
  hiburan: ['Film & Series', 'Musik', 'Selebriti', 'TV', 'K-Pop & K-Drama'],
};

// A category's slug doesn't necessarily match its current name - e.g. in
// production the "Hiburan" category still has slug "selebriti" (only its
// subdomain was renamed in an earlier pass, not the slug). Maps a known
// drifted slug to the SUBCATEGORIES key that actually applies to it.
const SLUG_ALIASES: Record<string, string> = {
  selebriti: 'hiburan',
};

async function generateSlug(name: string, organizationId: string): Promise<string> {
  const base = slugify(name, { lower: true, strict: true, trim: true }).substring(0, 240);
  let slug = base;
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.category.findFirst({
      where: { organizationId, slug, deletedAt: null },
    });
    if (!existing) return slug;
    slug = `${base}-${counter++}`;
  }
}

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, slug: true } });

  const recognizedSlugs = [...Object.keys(SUBCATEGORIES), ...Object.keys(SLUG_ALIASES)];

  for (const org of organizations) {
    const parents = await prisma.category.findMany({
      where: { organizationId: org.id, deletedAt: null, slug: { in: recognizedSlugs } },
      select: { id: true, slug: true, name: true },
    });

    if (parents.length === 0) continue;

    for (const parent of parents) {
      const names = SUBCATEGORIES[SLUG_ALIASES[parent.slug] ?? parent.slug];
      const existingChildren = await prisma.category.findMany({
        where: { organizationId: org.id, parentId: parent.id, deletedAt: null },
        select: { name: true },
      });
      const existingNames = new Set(existingChildren.map((c) => c.name));

      for (const [index, name] of names.entries()) {
        if (existingNames.has(name)) {
          console.log(`  [skip] ${org.slug} / ${parent.slug} / ${name} (already exists)`);
          continue;
        }
        const slug = await generateSlug(name, org.id);
        await prisma.category.create({
          data: {
            organizationId: org.id,
            parentId: parent.id,
            name,
            slug,
            sortOrder: index,
            isActive: true,
          },
        });
        console.log(`  [created] ${org.slug} / ${parent.slug} / ${name} (${slug})`);
      }
    }
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

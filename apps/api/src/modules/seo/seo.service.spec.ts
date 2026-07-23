import { SeoService } from './seo.service';

describe('SeoService', () => {
  // calculateSeoScore and generateArticleSchema don't touch Prisma/AI, so we
  // can instantiate the service with undefined collaborators for these tests.
  const service = new SeoService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

  describe('calculateSeoScore', () => {
    it('awards full marks to well-optimized content', () => {
      const content =
        '<h2>Intro</h2>' +
        '<p>' +
        Array.from({ length: 1000 }, () => 'word').join(' ') +
        ' widget ' +
        '</p>' +
        '<a href="/news/related-one">related one</a>' +
        '<a href="/news/related-two">related two</a>' +
        '<a href="/news/related-three">related three</a>' +
        '<img src="/a.jpg" alt="a photo">' +
        '<img src="/b.jpg" alt="another photo">' +
        '<h2>Body</h2>';
      const title = 'The Ultimate Widget Guide';

      const result = service.calculateSeoScore(content, title, {
        metaTitle: title,
        metaDescription: 'A'.repeat(140),
        focusKeyword: 'widget',
        slug: 'ultimate-widget-guide',
        hasSchema: true,
      });

      expect(result.details.headingStructure).toBe(10);
      expect(result.details.metaDescription).toBe(10);
      expect(result.details.internalLinks).toBe(10);
      expect(result.details.imageAltText).toBe(5);
      expect(result.details.schemaMarkup).toBe(10);
      expect(result.details.urlStructure).toBe(5);
      expect(result.total).toBeGreaterThan(50);
    });

    it('recommends improvements for thin, unoptimized content', () => {
      const result = service.calculateSeoScore(
        '<p>Too short.</p>',
        'A title with no keyword',
        {
          metaDescription: '',
          focusKeyword: 'widget',
          slug: 'x',
          hasSchema: false,
        },
      );

      expect(result.details.keywordInTitle).toBe(0);
      expect(result.details.wordCount).toBe(0);
      expect(result.details.schemaMarkup).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain(
        'Add structured data (Schema.org) markup',
      );
    });

    it('scores image alt text as full marks when there are no images', () => {
      const result = service.calculateSeoScore('<p>content</p>', 'Title', {});

      expect(result.details.imageAltText).toBe(5);
    });

    it('penalizes images missing alt text and recommends fixing them', () => {
      const content = '<img src="/a.jpg" alt="described"><img src="/b.jpg">';
      const result = service.calculateSeoScore(content, 'Title', {});

      expect(result.details.imageAltText).toBe(3);
      expect(result.recommendations).toContain('Add alt text to all images');
    });

    it('counts real internal links from the content, not an external option', () => {
      const withLinks = service.calculateSeoScore(
        '<p>content</p>' + '<a href="/news/a">a</a>'.repeat(3),
        'Title',
        {},
      );
      expect(withLinks.details.internalLinks).toBe(10);

      const withoutLinks = service.calculateSeoScore('<p>content</p>', 'Title', {});
      expect(withoutLinks.details.internalLinks).toBe(0);
      expect(withoutLinks.recommendations).toContain(
        'Add internal links to related content',
      );
    });
  });

  describe('generateArticleSchema', () => {
    it('builds NewsArticle JSON-LD and strips undefined fields', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'Breaking News',
          excerpt: 'Something happened',
          slug: 'breaking-news',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        'https://example.com',
      );

      expect(schema['@type']).toBe('NewsArticle');
      expect(schema.url).toBe('https://example.com/news/breaking-news');
      expect(schema.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': 'https://example.com/news/breaking-news',
      });
      expect(schema.headline).toBe('Breaking News');
      expect(schema).not.toHaveProperty('author');
      expect(schema).not.toHaveProperty('image');
      expect(schema).not.toHaveProperty('publisher');
    });

    it('includes the author name when an author is provided', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'Byline Story',
          slug: 'byline-story',
          author: { displayName: 'Jane Doe' },
        },
        'https://example.com',
      );

      expect(schema.author).toEqual({ '@type': 'Person', name: 'Jane Doe' });
    });

    it('links the author to their profile page when an id is provided', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'Byline Story',
          slug: 'byline-story',
          author: { id: 'author-1', displayName: 'Jane Doe' },
        },
        'https://example.com',
      );

      expect(schema.author).toEqual({
        '@type': 'Person',
        name: 'Jane Doe',
        url: 'https://example.com/author/author-1',
      });
    });

    it('includes articleSection, keywords, wordCount, inLanguage, and isAccessibleForFree when provided', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'Rich Story',
          slug: 'rich-story',
          primaryCategory: { name: 'Kesehatan', slug: 'kesehatan' },
          tags: ['Gizi', 'Nutrisi'],
          wordCount: 512,
          language: 'id',
        },
        'https://example.com',
      );

      expect(schema.isAccessibleForFree).toBe(true);
      expect(schema.articleSection).toBe('Kesehatan');
      expect(schema.keywords).toBe('Gizi, Nutrisi');
      expect(schema.wordCount).toBe(512);
      expect(schema.inLanguage).toBe('id');
    });

    it('includes image width/height when provided, and omits them when not', async () => {
      const withDimensions: any = await service.generateArticleSchema(
        {
          title: 'Photo Story',
          slug: 'photo-story',
          featuredImageUrl: 'https://example.com/photo.jpg',
          featuredImageWidth: 1200,
          featuredImageHeight: 630,
        },
        'https://example.com',
      );
      expect(withDimensions.image).toEqual({
        '@type': 'ImageObject',
        url: 'https://example.com/photo.jpg',
        width: 1200,
        height: 630,
      });

      const withoutDimensions: any = await service.generateArticleSchema(
        { title: 'Photo Story 2', slug: 'photo-story-2', featuredImageUrl: 'https://example.com/photo2.jpg' },
        'https://example.com',
      );
      expect(withoutDimensions.image).toEqual({
        '@type': 'ImageObject',
        url: 'https://example.com/photo2.jpg',
      });
    });

    it('falls back to publishedAt for dateModified when updatedAt is not given', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'No Edits Yet',
          slug: 'no-edits-yet',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        'https://example.com',
      );

      expect(schema.dateModified).toBe('2026-01-01T00:00:00.000Z');
    });

    it('prefers the real updatedAt for dateModified when the article was edited after publish', async () => {
      const schema: any = await service.generateArticleSchema(
        {
          title: 'Edited Story',
          slug: 'edited-story',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-05T12:00:00.000Z'),
        },
        'https://example.com',
      );

      expect(schema.dateModified).toBe('2026-01-05T12:00:00.000Z');
    });

    it('includes publisher with logo when organization info is provided', async () => {
      const schema: any = await service.generateArticleSchema(
        { title: 'Org Story', slug: 'org-story' },
        'https://example.com',
        { name: 'BeritaBot.com', logoUrl: 'https://example.com/logo.png' },
      );

      expect(schema.publisher).toEqual({
        '@type': 'NewsMediaOrganization',
        name: 'BeritaBot.com',
        url: 'https://example.com/about',
        logo: { '@type': 'ImageObject', url: 'https://example.com/logo.png' },
      });
    });

    it('omits publisher.logo when the organization has no logoUrl, but always includes the About page url', async () => {
      const schema: any = await service.generateArticleSchema(
        { title: 'No Logo Story', slug: 'no-logo-story' },
        'https://example.com',
        { name: 'BeritaBot.com' },
      );

      expect(schema.publisher).toEqual({
        '@type': 'NewsMediaOrganization',
        name: 'BeritaBot.com',
        url: 'https://example.com/about',
      });
    });
  });

  describe('generateSeoData', () => {
    it('still produces schema.org JSON-LD when the AI-backed meta title/description calls fail', async () => {
      // A long title forces generateMetaTitle down its AI-calling branch;
      // both AI-dependent calls are made to reject here, simulating AI
      // services being disabled - the schema.org piece needs no AI at all
      // and must not be lost as collateral damage.
      const aiGateway = { prompt: jest.fn().mockRejectedValue(new Error('AI services are currently disabled')) };
      const aiWriter = { generateMetaDescription: jest.fn().mockRejectedValue(new Error('AI services are currently disabled')) };
      const resilientService = new SeoService(undefined as any, aiGateway as any, aiWriter as any, undefined as any);

      const longTitle = 'A'.repeat(80);
      const result = await resilientService.generateSeoData(
        'article-1',
        { title: longTitle, content: '<p>Real article content.</p>', excerpt: 'A short excerpt.', slug: 'long-title-story' },
        'https://example.com',
      );

      expect((result.schemaJsonld as any)['@type']).toBe('NewsArticle');
      expect((result.schemaJsonld as any).headline).toBe(longTitle);
      expect(result.metaTitle).toBe(longTitle.substring(0, 60));
      expect(result.metaDescription).toBe('A short excerpt.');
    });
  });
});

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
        '<h2>Body</h2>';
      const title = 'The Ultimate Widget Guide';

      const result = service.calculateSeoScore(content, title, {
        metaTitle: title,
        metaDescription: 'A'.repeat(140),
        focusKeyword: 'widget',
        slug: 'ultimate-widget-guide',
        hasSchema: true,
        internalLinkCount: 3,
        imageCount: 2,
        imagesWithAlt: 2,
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
      const result = service.calculateSeoScore('<p>content</p>', 'Title', {
        imageCount: 0,
        imagesWithAlt: 0,
      });

      expect(result.details.imageAltText).toBe(5);
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
      expect(schema.url).toBe('https://example.com/breaking-news');
      expect(schema.headline).toBe('Breaking News');
      expect(schema).not.toHaveProperty('author');
      expect(schema).not.toHaveProperty('image');
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
  });
});

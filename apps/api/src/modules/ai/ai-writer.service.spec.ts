import { AIWriterService } from './ai-writer.service';

describe('AIWriterService', () => {
  describe('generateDraft', () => {
    it('strips a heading the model opened the article with, keeping the rest intact', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue(
          '<h2>Big Story Breaks</h2><p>The lead paragraph goes here.</p><h2>Background</h2><p>More context.</p>',
        ),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe(
        '<p>The lead paragraph goes here.</p><h2>Background</h2><p>More context.</p>',
      );
    });

    it('leaves content starting with a paragraph untouched', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue('<p>The lead paragraph goes here.</p><h2>Background</h2>'),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe('<p>The lead paragraph goes here.</p><h2>Background</h2>');
    });

    it('strips a leading heading even when the model also wrapped the output in a markdown code fence', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue(
          '```html\n<h3>Big Story Breaks</h3><p>The lead paragraph.</p>\n```',
        ),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe('<p>The lead paragraph.</p>');
    });

    it('passes each source publish date to the model and forbids inventing dates', async () => {
      const gateway = { prompt: jest.fn().mockResolvedValue('<p>ok</p>') };
      const service = new AIWriterService(gateway as any);

      await service.generateDraft({
        title: 'Flood hits region',
        sources: [
          { title: 'Report A', url: 'https://a.example', excerpt: 'x', publishedAt: '2026-08-29T10:00:00Z' },
          { title: 'Report B', url: 'https://b.example', excerpt: 'y', publishedAt: null },
        ],
      });

      const [systemPrompt, userPrompt] = gateway.prompt.mock.calls[0];
      expect(userPrompt).toContain('[published 2026-08-29] Report A');
      expect(userPrompt).toContain('[no date given] Report B');
      expect(systemPrompt).toMatch(/never invent or assume a date/i);
    });
  });

  describe('translateArticle', () => {
    function makeGateway(body: string, meta: object) {
      return {
        prompt: jest.fn().mockResolvedValue(body),
        jsonPrompt: jest.fn().mockResolvedValue(meta),
      };
    }

    it('translates the body via prompt() and the metadata via jsonPrompt(), naming both languages', async () => {
      const gateway = makeGateway('<p>The translated lead.</p><h2>Background</h2><p>More.</p>', {
        title: 'Government Calls Up 3 Diaspora Players',
        subtitle: 'A sporting shake-up',
        excerpt: 'The federation announced the call-ups on Monday.',
      });
      const service = new AIWriterService(gateway as any);

      const result = await service.translateArticle({
        title: 'PSSI Panggil 3 Pemain Diaspora',
        subtitle: 'Kejutan di timnas',
        excerpt: 'Federasi mengumumkan pemanggilan pada Senin.',
        content: '<p>Paragraf pembuka.</p><h2>Latar</h2><p>Lebih lanjut.</p>',
      });

      expect(result).toEqual({
        title: 'Government Calls Up 3 Diaspora Players',
        subtitle: 'A sporting shake-up',
        excerpt: 'The federation announced the call-ups on Monday.',
        content: '<p>The translated lead.</p><h2>Background</h2><p>More.</p>',
      });

      const [bodySystem] = gateway.prompt.mock.calls[0];
      expect(bodySystem).toContain('Indonesian (Bahasa Indonesia)');
      expect(bodySystem).toContain('English');
      expect(bodySystem).toMatch(/never change, add or remove an HTML tag/i);
    });

    it('strips a markdown code fence the model wrapped the HTML in', async () => {
      const gateway = makeGateway('```html\n<p>Translated.</p>\n```', {
        title: 'T',
        subtitle: '',
        excerpt: '',
      });
      const service = new AIWriterService(gateway as any);

      const result = await service.translateArticle({ title: 'Judul', content: '<p>Asli.</p>' });

      expect(result.content).toBe('<p>Translated.</p>');
    });

    it('falls back to the source title and nulls empty subtitle/excerpt', async () => {
      const gateway = makeGateway('<p>Body.</p>', { title: '  ', subtitle: '   ', excerpt: '' });
      const service = new AIWriterService(gateway as any);

      const result = await service.translateArticle({ title: 'Judul Asli', content: '<p>x</p>' });

      expect(result.title).toBe('Judul Asli');
      expect(result.subtitle).toBeNull();
      expect(result.excerpt).toBeNull();
    });
  });
});

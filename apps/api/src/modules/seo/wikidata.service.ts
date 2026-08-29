import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import axios from 'axios';

import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

const API_URL = 'https://www.wikidata.org/w/api.php';
const UA = 'RusdiMedia/1.0 (https://rusdimedia.com; structured-data entity linking)';

// Redis keys: wikidata:ent:<lang>:<normalised-name> -> "Q123", or "-" for a
// confirmed no-match (negative cache). Wikidata data barely moves, so a
// long positive TTL is fine; negatives expire sooner so a transient API
// failure gets another chance quickly.
const CACHE_PREFIX = 'wikidata:ent:';
const TTL_HIT_SECONDS = 30 * 24 * 60 * 60;
const TTL_MISS_SECONDS = 3 * 24 * 60 * 60;
const NEGATIVE = '-';

const PER_ARTICLE_LIMIT = 12;
const REQUEST_TIMEOUT_MS = 4000;

/**
 * Resolves plain entity names (people, orgs, places, events - from the GEO
 * engine's entitiesCovered) to Wikidata Q-ids, so the NewsArticle JSON-LD
 * `about[]` can carry a `sameAs` that disambiguates each entity. Cached
 * hard in Redis; every failure mode degrades to "no link", never throws.
 */
@Injectable()
export class WikidataService {
  private readonly logger = new Logger(WikidataService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** name -> "https://www.wikidata.org/wiki/Q..." for names that resolve. */
  async resolveEntities(names: string[], lang = 'id'): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 1))].slice(
      0,
      PER_ARTICLE_LIMIT,
    );
    if (unique.length === 0) return result;

    await Promise.all(
      unique.map(async (name) => {
        try {
          const qid = await this.resolveOne(name, lang);
          if (qid) result.set(name, `https://www.wikidata.org/wiki/${qid}`);
        } catch (err: any) {
          this.logger.debug(`Wikidata lookup failed for "${name}": ${err?.message ?? err}`);
        }
      }),
    );

    return result;
  }

  private cacheKey(name: string, lang: string): string {
    return `${CACHE_PREFIX}${lang}:${name.toLowerCase()}`;
  }

  private async resolveOne(name: string, lang: string): Promise<string | null> {
    const key = this.cacheKey(name, lang);

    const cached = await this.redis.get(key).catch(() => null);
    if (cached === NEGATIVE) return null;
    if (cached) return cached;

    const res = await axios.get(API_URL, {
      params: {
        action: 'wbsearchentities',
        search: name,
        language: lang,
        uselang: lang,
        type: 'item',
        limit: 1,
        format: 'json',
      },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const qid: string | undefined = res.data?.search?.[0]?.id;
    if (qid && /^Q\d+$/.test(qid)) {
      await this.redis.set(key, qid, 'EX', TTL_HIT_SECONDS).catch(() => undefined);
      return qid;
    }

    await this.redis.set(key, NEGATIVE, 'EX', TTL_MISS_SECONDS).catch(() => undefined);
    return null;
  }
}

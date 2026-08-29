import axios from 'axios';
import { WikidataService } from './wikidata.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WikidataService', () => {
  let redis: any;
  let service: WikidataService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    service = new WikidataService(redis);
  });

  it('resolves a name to its Wikidata item URL and caches the Q-id', async () => {
    mockedAxios.get.mockResolvedValue({ data: { search: [{ id: 'Q3899' }] } } as any);

    const map = await service.resolveEntities(['Nusa Tenggara Timur']);

    expect(map.get('Nusa Tenggara Timur')).toBe('https://www.wikidata.org/wiki/Q3899');
    expect(redis.set).toHaveBeenCalledWith(
      'wikidata:ent:id:nusa tenggara timur',
      'Q3899',
      'EX',
      expect.any(Number),
    );
  });

  it('serves a cached Q-id without hitting the API', async () => {
    redis.get.mockResolvedValue('Q42');

    const map = await service.resolveEntities(['Douglas Adams']);

    expect(map.get('Douglas Adams')).toBe('https://www.wikidata.org/wiki/Q42');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('honours a negative cache entry (no API call, no link)', async () => {
    redis.get.mockResolvedValue('-');

    const map = await service.resolveEntities(['Some Made Up Thing']);

    expect(map.size).toBe(0);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('negative-caches a no-match result', async () => {
    mockedAxios.get.mockResolvedValue({ data: { search: [] } } as any);

    const map = await service.resolveEntities(['Nonexistent Entity']);

    expect(map.size).toBe(0);
    expect(redis.set).toHaveBeenCalledWith(
      'wikidata:ent:id:nonexistent entity',
      '-',
      'EX',
      expect.any(Number),
    );
  });

  it('never throws when the API fails - the entity just gets no link', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'));

    await expect(service.resolveEntities(['X entity'])).resolves.toBeInstanceOf(Map);
  });

  it('dedupes, trims, drops 1-char names and caps at 12 lookups', async () => {
    mockedAxios.get.mockResolvedValue({ data: { search: [{ id: 'Q1' }] } } as any);

    const many = Array.from({ length: 20 }, (_, i) => `Entity ${i}`);
    await service.resolveEntities([...many, '  Entity 0  ', 'a', '']);

    expect(mockedAxios.get).toHaveBeenCalledTimes(12);
  });
});

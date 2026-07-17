import { buildStockPhotoQuery } from './category-stock-query.util';

describe('buildStockPhotoQuery', () => {
  it('maps known Indonesian category names to an English search term', () => {
    expect(buildStockPhotoQuery('Keuangan')).toBe('business finance');
    expect(buildStockPhotoQuery('Olahraga')).toBe('sports stadium');
    expect(buildStockPhotoQuery('Politik')).toBe('politics government');
    expect(buildStockPhotoQuery('Teknologi')).toBe('technology computer');
    expect(buildStockPhotoQuery('Otomotif')).toBe('automotive car');
    expect(buildStockPhotoQuery('Kesehatan')).toBe('health medical');
    expect(buildStockPhotoQuery('Wisata')).toBe('travel destination');
    expect(buildStockPhotoQuery('Selebriti')).toBe('entertainment celebrity');
    expect(buildStockPhotoQuery('Dunia')).toBe('world global city');
  });

  it('is case-insensitive and slug-tolerant', () => {
    expect(buildStockPhotoQuery('keuangan')).toBe('business finance');
    expect(buildStockPhotoQuery('KEUANGAN')).toBe('business finance');
    expect(buildStockPhotoQuery('gaya-hidup')).toBe('lifestyle');
  });

  it('falls back to a generic news query for an unmapped or missing category', () => {
    expect(buildStockPhotoQuery('Some Custom Category')).toBe('newspaper journalism');
    expect(buildStockPhotoQuery(null)).toBe('newspaper journalism');
    expect(buildStockPhotoQuery(undefined)).toBe('newspaper journalism');
  });
});

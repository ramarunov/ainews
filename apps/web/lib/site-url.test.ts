import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getAbsoluteUrl,
  getArticleUrl,
  getCategoryUrl,
  getRootDomain,
  isCategorySubdomainsEnabled,
  resolveHostCategory,
} from "./site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRootDomain", () => {
  it("prefers NEXT_PUBLIC_ROOT_DOMAIN", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "public.example.com");
    vi.stubEnv("ROOT_DOMAIN", "server.example.com");
    expect(getRootDomain()).toBe("public.example.com");
  });

  it("falls back to the server-only ROOT_DOMAIN when NEXT_PUBLIC_ROOT_DOMAIN is unset", () => {
    // getRootDomain uses `??`, which only falls through on null/undefined -
    // an actually-unset env var, not an empty string - so this needs a real
    // `delete`, unlike vi.stubEnv's "" (which IS a defined value to `??`).
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    vi.stubEnv("ROOT_DOMAIN", "server.example.com");
    expect(getRootDomain()).toBe("server.example.com");
  });

  it("defaults to rusdimedia.com when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    delete process.env.ROOT_DOMAIN;
    expect(getRootDomain()).toBe("rusdimedia.com");
  });
});

describe("isCategorySubdomainsEnabled", () => {
  it("is false by default", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "");
    vi.stubEnv("ENABLE_CATEGORY_SUBDOMAINS", "");
    expect(isCategorySubdomainsEnabled()).toBe(false);
  });

  it("is true when NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS=true", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    expect(isCategorySubdomainsEnabled()).toBe(true);
  });

  it("is true when the server-only ENABLE_CATEGORY_SUBDOMAINS=true", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "");
    vi.stubEnv("ENABLE_CATEGORY_SUBDOMAINS", "true");
    expect(isCategorySubdomainsEnabled()).toBe(true);
  });
});

describe("getCategoryUrl / getArticleUrl", () => {
  it("resolves to the category subdomain when assigned and the feature flag is on", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const category = { slug: "kesehatan", subdomain: "kesehatan" };
    expect(getCategoryUrl(category, "rusdimedia.com")).toBe("https://kesehatan.rusdimedia.com");
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: category }, "rusdimedia.com")).toBe(
      "https://kesehatan.rusdimedia.com/artikel-a",
    );
  });

  it("falls back to the apex /category/:slug path when the category has no subdomain", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const category = { slug: "kesehatan", subdomain: null };
    expect(getCategoryUrl(category, "rusdimedia.com")).toBe("https://rusdimedia.com/category/kesehatan");
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: category }, "rusdimedia.com")).toBe(
      "https://rusdimedia.com/artikel-a",
    );
  });

  it("ignores an assigned subdomain when the feature flag is off (kill switch)", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "");
    vi.stubEnv("ENABLE_CATEGORY_SUBDOMAINS", "");
    const category = { slug: "kesehatan", subdomain: "kesehatan" };
    expect(getCategoryUrl(category, "rusdimedia.com")).toBe("https://rusdimedia.com/category/kesehatan");
  });

  it("falls back to the apex /:slug path when the article has no primary category", () => {
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: null }, "rusdimedia.com")).toBe(
      "https://rusdimedia.com/artikel-a",
    );
  });

  it("resolves a subcategory to a path under its parent's subdomain, not a subdomain of its own", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const gizi = { slug: "gizi", subdomain: null, parent: { subdomain: "kesehatan" } };
    expect(getCategoryUrl(gizi, "rusdimedia.com")).toBe("https://kesehatan.rusdimedia.com/gizi");
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: gizi }, "rusdimedia.com")).toBe(
      "https://kesehatan.rusdimedia.com/artikel-a",
    );
  });

  it("a subcategory's own subdomain (if ever assigned) still wins over its parent's", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const gizi = { slug: "gizi", subdomain: "gizi", parent: { subdomain: "kesehatan" } };
    expect(getCategoryUrl(gizi, "rusdimedia.com")).toBe("https://gizi.rusdimedia.com");
  });

  it("falls back to the apex /category/:slug path for a subcategory whose parent has no subdomain either", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const gizi = { slug: "gizi", subdomain: null, parent: { subdomain: null } };
    expect(getCategoryUrl(gizi, "rusdimedia.com")).toBe("https://rusdimedia.com/category/gizi");
  });

  it("ignores parent-subdomain inheritance when the feature flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "");
    vi.stubEnv("ENABLE_CATEGORY_SUBDOMAINS", "");
    const gizi = { slug: "gizi", subdomain: null, parent: { subdomain: "kesehatan" } };
    expect(getCategoryUrl(gizi, "rusdimedia.com")).toBe("https://rusdimedia.com/category/gizi");
  });
});

describe("getAbsoluteUrl", () => {
  it("joins a leading-slash path onto the hostname", () => {
    expect(getAbsoluteUrl("/sitemap.xml", "kesehatan.rusdimedia.com")).toBe(
      "https://kesehatan.rusdimedia.com/sitemap.xml",
    );
  });

  it("adds the missing leading slash for a bare path", () => {
    expect(getAbsoluteUrl("sitemap.xml", "rusdimedia.com")).toBe("https://rusdimedia.com/sitemap.xml");
  });
});

describe("resolveHostCategory", () => {
  const categories = [
    { id: "1", subdomain: "kesehatan" },
    { id: "2", subdomain: "teknologi" },
    { id: "3", subdomain: null },
  ];

  it("returns undefined for the apex hostname itself", () => {
    expect(resolveHostCategory("rusdimedia.com", "rusdimedia.com", categories)).toBeUndefined();
  });

  it("returns undefined for an empty hostname", () => {
    expect(resolveHostCategory("", "rusdimedia.com", categories)).toBeUndefined();
  });

  it("matches a known category subdomain", () => {
    expect(resolveHostCategory("kesehatan.rusdimedia.com", "rusdimedia.com", categories)).toEqual(
      categories[0],
    );
  });

  it("returns undefined for an unregistered subdomain - never invents a category", () => {
    expect(resolveHostCategory("sembarang.rusdimedia.com", "rusdimedia.com", categories)).toBeUndefined();
  });

  it("returns undefined for a host that isn't even a subdomain of the root domain", () => {
    expect(resolveHostCategory("kesehatan.evil-rusdimedia.com", "rusdimedia.com", categories)).toBeUndefined();
  });
});

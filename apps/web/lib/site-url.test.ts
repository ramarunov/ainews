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

  it("defaults to beritabot.com when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    delete process.env.ROOT_DOMAIN;
    expect(getRootDomain()).toBe("beritabot.com");
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
    expect(getCategoryUrl(category, "beritabot.com")).toBe("https://kesehatan.beritabot.com");
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: category }, "beritabot.com")).toBe(
      "https://kesehatan.beritabot.com/news/artikel-a",
    );
  });

  it("falls back to the apex /category/:slug path when the category has no subdomain", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "true");
    const category = { slug: "kesehatan", subdomain: null };
    expect(getCategoryUrl(category, "beritabot.com")).toBe("https://beritabot.com/category/kesehatan");
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: category }, "beritabot.com")).toBe(
      "https://beritabot.com/news/artikel-a",
    );
  });

  it("ignores an assigned subdomain when the feature flag is off (kill switch)", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS", "");
    vi.stubEnv("ENABLE_CATEGORY_SUBDOMAINS", "");
    const category = { slug: "kesehatan", subdomain: "kesehatan" };
    expect(getCategoryUrl(category, "beritabot.com")).toBe("https://beritabot.com/category/kesehatan");
  });

  it("falls back to the apex /news/:slug path when the article has no primary category", () => {
    expect(getArticleUrl({ slug: "artikel-a", primaryCategory: null }, "beritabot.com")).toBe(
      "https://beritabot.com/news/artikel-a",
    );
  });
});

describe("getAbsoluteUrl", () => {
  it("joins a leading-slash path onto the hostname", () => {
    expect(getAbsoluteUrl("/sitemap.xml", "kesehatan.beritabot.com")).toBe(
      "https://kesehatan.beritabot.com/sitemap.xml",
    );
  });

  it("adds the missing leading slash for a bare path", () => {
    expect(getAbsoluteUrl("sitemap.xml", "beritabot.com")).toBe("https://beritabot.com/sitemap.xml");
  });
});

describe("resolveHostCategory", () => {
  const categories = [
    { id: "1", subdomain: "kesehatan" },
    { id: "2", subdomain: "teknologi" },
    { id: "3", subdomain: null },
  ];

  it("returns undefined for the apex hostname itself", () => {
    expect(resolveHostCategory("beritabot.com", "beritabot.com", categories)).toBeUndefined();
  });

  it("returns undefined for an empty hostname", () => {
    expect(resolveHostCategory("", "beritabot.com", categories)).toBeUndefined();
  });

  it("matches a known category subdomain", () => {
    expect(resolveHostCategory("kesehatan.beritabot.com", "beritabot.com", categories)).toEqual(
      categories[0],
    );
  });

  it("returns undefined for an unregistered subdomain - never invents a category", () => {
    expect(resolveHostCategory("sembarang.beritabot.com", "beritabot.com", categories)).toBeUndefined();
  });

  it("returns undefined for a host that isn't even a subdomain of the root domain", () => {
    expect(resolveHostCategory("kesehatan.evil-beritabot.com", "beritabot.com", categories)).toBeUndefined();
  });
});

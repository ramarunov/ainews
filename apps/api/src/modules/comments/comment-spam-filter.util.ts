// Deterministic, dependency-free spam/abuse checks for public comment
// submission - no AI call and no third-party CAPTCHA/Akismet-style service,
// since this only needs to catch the obvious cases before a human moderator
// reviews the rest (moderation is mandatory for every comment regardless).

// Matches http(s)://, www., or a bare "word.tld/…" / "word.tld" pattern -
// deliberately broad (a few benign false positives, e.g. "the Boeing 747
// vs.com" is not realistic prose) since the cost of a rejected comment is
// low (the author can just remove the link and resubmit) versus the cost
// of a comment link slipping through as an XSS/spam vector.
const LINK_PATTERN =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|id|info|xyz|top|club|site|online|biz|link)\b/i;

export function containsLink(content: string): boolean {
  return LINK_PATTERN.test(content);
}

const SPAM_KEYWORDS = [
  'viagra', 'cialis', 'casino', 'judi online', 'slot gacor', 'togel',
  'crypto airdrop', 'forex signal', 'penis', 'pinjaman online', 'pinjol',
  'work from home', 'make money fast', 'click here', 'klik disini',
];

const SPAM_SCORE_THRESHOLD = 5;

/**
 * Higher = more likely spam. Callers auto-mark a comment as SPAM (skipping
 * the normal PENDING moderation queue, though still visible under a "Spam"
 * filter for a moderator to correct a false positive) once this reaches
 * SPAM_SCORE_THRESHOLD.
 */
export function computeSpamScore(content: string, authorName: string): number {
  let score = 0;
  const lower = content.toLowerCase();

  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) score += 4;
  }

  const letters = content.replace(/[^a-zA-Z]/g, '');
  const upper = content.replace(/[^A-Z]/g, '');
  if (letters.length >= 15 && upper.length / letters.length > 0.7) {
    score += 3; // SHOUTING IN ALL CAPS
  }

  if (/(.)\1{5,}/.test(content)) score += 2; // "aaaaaaaa" / "!!!!!!!!"

  if ((content.match(/[!?]/g)?.length ?? 0) >= 8) score += 2;

  if (content.trim().length < 3) score += 2; // near-empty / bot probe

  if (/\d{7,}/.test(content)) score += 2; // long digit runs (phone numbers)

  if (/^[a-z0-9]{1,3}$/i.test(authorName.trim())) score += 1; // "a1", "xx"

  return score;
}

export function isLikelySpam(content: string, authorName: string): boolean {
  return computeSpamScore(content, authorName) >= SPAM_SCORE_THRESHOLD;
}

import DOMPurify from 'isomorphic-dompurify';

// Strict allowlist matching exactly what the Tiptap editor's StarterKit +
// link/image extensions can produce — strips <script>, event handler
// attributes (onerror, onclick, ...), <iframe>, and anything else not on
// the list, per SECURITY.md's XSS prevention requirement. Shared by
// ArticlesService and NewsIntelligenceService (RSS/extracted HTML is
// untrusted third-party input and must go through the same allowlist).
export const ALLOWED_CONTENT_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 's', 'u', 'code', 'mark',
  'a', 'img',
  'ul', 'ol', 'li',
  'blockquote', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
export const ALLOWED_CONTENT_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel'];

export function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_CONTENT_TAGS,
    ALLOWED_ATTR: ALLOWED_CONTENT_ATTR,
  });
}

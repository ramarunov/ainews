export interface DefaultRoleDefinition {
  name: string;
  slug: string;
  description: string;
  permissions: string[];
}

const ARTICLES_ALL = ['articles:read', 'articles:write', 'articles:publish', 'articles:delete'];
const CATEGORIES_ALL = ['categories:read', 'categories:write', 'categories:delete'];
const TAGS_ALL = ['tags:read', 'tags:write', 'tags:delete'];
const MEDIA_ALL = ['media:read', 'media:write', 'media:delete'];
const WORKFLOW_ALL = ['workflow:read', 'workflow:write'];
const NEWS_ALL = ['news:read', 'news:write', 'news:manage-sources'];
const USERS_ALL = ['users:read', 'users:write', 'users:delete'];
const ORGANIZATIONS_ALL = ['organizations:read', 'organizations:write'];
const SETTINGS_ALL = ['settings:read', 'settings:write'];
const PLUGINS_ALL = ['plugins:read', 'plugins:write'];
const THEMES_ALL = ['themes:read', 'themes:write'];
const WEBHOOKS_ALL = ['webhooks:read', 'webhooks:write', 'webhooks:delete'];
const COMMENTS_ALL = ['comments:read', 'comments:moderate'];

export const ALL_PERMISSIONS = [
  ...ARTICLES_ALL,
  ...CATEGORIES_ALL,
  ...TAGS_ALL,
  ...MEDIA_ALL,
  ...WORKFLOW_ALL,
  'search:read',
  'analytics:read',
  'ai:use',
  ...NEWS_ALL,
  ...USERS_ALL,
  ...ORGANIZATIONS_ALL,
  ...SETTINGS_ALL,
  ...PLUGINS_ALL,
  ...THEMES_ALL,
  ...WEBHOOKS_ALL,
  ...COMMENTS_ALL,
  'audit:read',
];

export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access to every module, including organization, user, and system settings.',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Editor',
    slug: 'editor',
    description: 'Manages content end-to-end: create, publish, delete articles, and oversee editorial workflow.',
    permissions: [
      ...ARTICLES_ALL,
      ...CATEGORIES_ALL,
      ...TAGS_ALL,
      ...MEDIA_ALL,
      ...WORKFLOW_ALL,
      ...NEWS_ALL,
      ...COMMENTS_ALL,
      'search:read',
      'analytics:read',
      'ai:use',
      'users:read',
      'settings:read',
    ],
  },
  {
    name: 'Writer',
    slug: 'writer',
    description: 'Creates and edits articles, but cannot publish, delete, or manage other users.',
    permissions: [
      'articles:read',
      'articles:write',
      'categories:read',
      'tags:read',
      'media:read',
      'media:write',
      'workflow:read',
      'news:read',
      'search:read',
      'ai:use',
    ],
  },
  {
    name: 'SEO Manager',
    slug: 'seo-manager',
    description: 'Owns SEO/GEO optimization, analytics, and content audits.',
    permissions: [
      'articles:read',
      'articles:write',
      'categories:read',
      'tags:read',
      'search:read',
      'analytics:read',
      'ai:use',
      'news:read',
    ],
  },
];

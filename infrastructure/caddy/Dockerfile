# Custom Caddy build with the Cloudflare DNS module, needed for the
# wildcard (*.beritabot.com) certificate's DNS-01 ACME challenge - the
# stock caddy:2-alpine image (used for the apex/app/api hosts, which only
# ever needed HTTP-01) doesn't include any DNS provider plugin.
#
# See docs/DEPLOY.md §7.1 for the full wildcard-subdomain rollout this
# plugs into, and the Caddyfile's `acme_dns cloudflare` global option
# that actually uses this module at runtime.
FROM caddy:2-builder AS builder

RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Deployment Guide
## AI Native News CMS — Enterprise Edition

This is a hands-on walkthrough for taking this repo from "runs on my laptop"
to "live on a real server," on a single VPS with Docker. It assumes no prior
DevOps setup beyond an SSH key and a credit card.

If you outgrow a single server later, `infrastructure/k8s/` already has a
starting set of Kubernetes manifests, and `docs/DEVOPS.md` §5–§9 covers the
larger architecture (managed databases, autoscaling, disaster recovery).
This guide is the path to get a real deployment running first.

---

## 1. Choosing a server

### 1.1 What actually needs to run

| Component | What it is | Can be swapped for a managed service? |
|---|---|---|
| `api` (NestJS) | The application itself | No — this is what you're deploying |
| `web` (Next.js) | The application itself | No — this is what you're deploying |
| PostgreSQL 16 + pgvector | Primary datastore, RLS-enforced multi-tenancy | Yes — RDS, Cloud SQL, Neon, Supabase (must support the `vector` extension) |
| Redis 7 | Sessions/locks/rate-limiting/BullMQ queue | Yes — ElastiCache, Upstash, Redis Cloud |
| OpenSearch 2.x | Full-text/semantic search | Yes — Amazon OpenSearch Service, Bonsai |
| S3-compatible object storage | Uploaded media, stock photos | Yes — real AWS S3, Cloudflare R2, Backblaze B2 (MinIO is only the self-hosted stand-in) |
| SMTP | Password resets, notifications | Always external — Postgres/Redis/etc. above can be self-hosted, SMTP realistically can't |

Nothing here needs a GPU, a cluster, or a CDN to get started. The heaviest
single piece is OpenSearch, which wants headroom for its JVM heap.

### 1.2 Sizing

| Tier | Specs | Fits |
|---|---|---|
| Minimum | 4 vCPU / 8 GB RAM / 80 GB SSD | Launch, low-to-moderate traffic, all services on one box |
| Comfortable | 4–8 vCPU / 16 GB RAM / 160 GB+ SSD | Real editorial team, autonomous AI pipeline running continuously, room to grow before you need a second box |

8 GB is genuinely tight once Postgres, Redis, OpenSearch (512 MB JVM heap
per `docker-compose.yml`), MinIO, and both Node processes are all running
at once — 16 GB removes most of the guesswork. If you'd rather not run
OpenSearch/MinIO yourself at all, use a managed search service and real S3
instead and the minimum tier comfortably handles just Postgres+Redis+the
app.

### 1.3 Where to get one

Any of these work; pick based on region/support preference, not features —
none of what follows is provider-specific beyond "Ubuntu 22.04/24.04 LTS +
root SSH access":

- **Hetzner Cloud** — best price-to-spec ratio, EU-based.
- **DigitalOcean / Vultr / Linode (Akamai)** — simple droplet-style
  provisioning, wide region choice, good docs if this is your first VPS.
- **AWS EC2 / GCP Compute Engine** — pick these if you already have AWS/GCP
  billing set up, or plan to move to their managed Postgres/Redis/
  OpenSearch/S3 later and want everything in one account.

Provision an instance, note its public IP, and make sure you can
`ssh root@<ip>` before continuing.

---

## 2. Point your domain at the server

You need at least one domain, ideally two subdomains: one for the reader
site (`app.example.com`), one for the API (`api.example.com`). Create two
`A` records at your DNS provider, both pointing at the server's IP. This
can take a few minutes to a few hours to propagate — do it now so it's
ready by the time you need HTTPS certificates (§7).

```
app.example.com   A   <your-server-ip>
api.example.com   A   <your-server-ip>
```

### 2.1 Optional: wildcard DNS for category subdomains

If you want per-category subdomains (`kesehatan.example.com`,
`teknologi.example.com`, ...) rather than every category living at
`example.com/category/kesehatan`, also add:

```
example.com        A   <your-server-ip>
*.example.com       A   <your-server-ip>
```

A single wildcard `A` record covers every category subdomain — you don't
add a new DNS record each time an admin assigns a category a subdomain.
This is entirely optional and off by default (`ENABLE_CATEGORY_SUBDOMAINS=
false`); skip this if you only want the apex + `app.`/`api.` split. See
§7.1 for the matching Caddy/TLS side of this and the full rollout order.

---

## 3. Initial server setup

SSH in as root, then:

```bash
# Create a non-root user rather than operating as root day-to-day
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Firewall — only SSH, HTTP, HTTPS reach the server directly.
# Everything else (Postgres, Redis, OpenSearch, MinIO console) stays
# behind Docker's internal network, never bound to a public port.
apt update && apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Install Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in as `deploy` from here on (`ssh deploy@<ip>`) so Docker
commands don't need `sudo`.

---

## 4. Get the code onto the server

```bash
sudo mkdir -p /opt/ainews-cms
sudo chown deploy:deploy /opt/ainews-cms
git clone <your-repo-url> /opt/ainews-cms
cd /opt/ainews-cms
```

(If the repo is private, set up a deploy key or use `gh auth login` first.)

---

## 5. Configure production secrets

Copy the reference file and fill it in — **do not** just reuse the
`.env.example` values as-is, several are checked at boot:

```bash
cp .env.example .env.production
```

Generate real random secrets for anything `.env.example` marks
`change-this-...`:

```bash
# Run once per secret you need (JWT_SECRET, JWT_REFRESH_SECRET,
# SESSION_SECRET, CSRF_SECRET, WEBHOOK_SECRET, ENCRYPTION_KEY)
openssl rand -hex 32
```

`config.validation.ts` refuses to boot the API at all with
`NODE_ENV=production` if any of `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`SESSION_SECRET`, `ENCRYPTION_KEY`, `CSRF_SECRET`, or `WEBHOOK_SECRET` are
still their exact `.env.example` placeholder value — this isn't a step you
can skip and fix later, the container simply won't start.

At minimum, also set in `.env.production`:

```bash
NODE_ENV=production
APP_URL=https://app.example.com
API_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com
COOKIE_DOMAIN=example.com
COOKIE_SECURE=true

DATABASE_URL=postgresql://ainews_app:<strong-app-password>@postgres:5432/ainews_db
DIRECT_DATABASE_URL=postgresql://ainews:<strong-superuser-password>@postgres:5432/ainews_db
DATABASE_SUPERUSER_PASSWORD=<same strong superuser password>

REDIS_URL=redis://:<strong-redis-password>@redis:6379
REDIS_HOST=redis
REDIS_PASSWORD=<same strong redis password>

OPENSEARCH_URL=http://opensearch:9200

S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=https://media.example.com/ainews-media
MINIO_ROOT_USER=<strong minio user>
MINIO_ROOT_PASSWORD=<strong minio password>
S3_ACCESS_KEY=<same as MINIO_ROOT_USER>
S3_SECRET_KEY=<same as MINIO_ROOT_PASSWORD>

NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
NEXT_PUBLIC_MEDIA_URL=https://media.example.com/ainews-media
NEXT_PUBLIC_SITE_URL=https://app.example.com

# Category subdomains (§2.1/§7.1) - safe to leave at these defaults even if
# you don't want the feature; ROOT_DOMAIN only matters once
# ENABLE_CATEGORY_SUBDOMAINS is true.
ROOT_DOMAIN=example.com
NEXT_PUBLIC_ROOT_DOMAIN=example.com
ENABLE_CATEGORY_SUBDOMAINS=false

SMTP_HOST=<your real SMTP provider>
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=<...>
SMTP_PASSWORD=<...>
EMAIL_FROM=noreply@example.com

PUBLIC_SITE_ORG_ID=   # fill in after you create your organization (§9)
```

If you're using real S3/R2 instead of self-hosted MinIO, point `S3_*` at
that provider instead and skip the `minio`/`minio-init` services entirely
(remove them from `docker-compose.prod.yml`, or just never reference
their volume).

`.env.production` is already covered by `.gitignore` — double-check with
`git check-ignore .env.production` before you forget and commit real
secrets.

### 5.1 Set the database role passwords

`infrastructure/postgres/init.sql` creates the two roles the app actually
uses (`ainews_app`, which is what `DATABASE_URL` connects as, and
`ainews_readonly`) with **hardcoded placeholder passwords**. This script
only runs once, against a brand-new empty Postgres data volume — edit it
now, before the first `docker compose up`, to match the passwords you put
in `.env.production` above:

```sql
-- infrastructure/postgres/init.sql
CREATE ROLE ainews_app WITH LOGIN PASSWORD '<strong-app-password>' NOSUPERUSER NOBYPASSRLS;
...
CREATE ROLE ainews_readonly WITH LOGIN PASSWORD '<strong-readonly-password>';
```

If you forget this step and only notice after the volume already exists,
you'll need to either `docker exec` in and `ALTER ROLE ... PASSWORD '...'`
by hand, or wipe the `postgres_data` volume and start over — init scripts
never re-run against existing data.

---

## 6. Build the application images

```bash
cd /opt/ainews-cms
docker compose -f docker-compose.prod.yml --env-file .env.production build
```

This builds `api` and `web` from their own multi-stage Dockerfiles (build
context is the repo root — both Dockerfiles depend on `turbo prune` seeing
the whole workspace). The `web` build bakes in `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_MEDIA_URL`, and `NEXT_PUBLIC_SITE_URL` — Next.js embeds these
into the client bundle and its image-optimization config at *build* time,
not container start time, so if you ever change any of them you need to
rebuild the `web` image, not just restart the container.

---

## 7. Bring up the stack

```bash
# Start the backing services first
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d postgres redis opensearch minio minio-init

# Wait for Postgres to report healthy, then run migrations once
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm api-migrate

# Now bring up the app and the reverse proxy
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d api web caddy
```

Edit `infrastructure/caddy/Caddyfile` first and replace `app.example.com`/
`api.example.com` with your real domains (matching §2's DNS records) —
Caddy requests a Let's Encrypt certificate for whatever hostnames are in
that file the moment it starts, and needs them to already resolve here.

Check everything is up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

All services should show `healthy` within about a minute (OpenSearch is
the slowest to start).

### 7.1 Enabling category subdomains (optional)

Skip this entirely if you didn't set up the wildcard DNS record in §2.1 —
`ENABLE_CATEGORY_SUBDOMAINS=false` (the default) means none of this is
needed and every category lives at `example.com/category/:slug`.

**Why a wildcard cert needs extra setup.** Let's Encrypt can only issue a
certificate covering `*.example.com` via the **DNS-01** challenge (proving
you control the domain by creating a TXT record), not the plain **HTTP-01**
challenge Caddy uses by default for `app.example.com`/`api.example.com`
above (proving control by serving a file over HTTP). The stock
`caddy:2-alpine` image in `docker-compose.prod.yml` does not include a
DNS-01 provider module — you need a custom-built Caddy image with one.

1. **Build a Caddy image with your DNS provider's module.** Using
   Cloudflare as an example (swap for your own DNS provider — Caddy has
   modules for most major ones, see https://caddyserver.com/download):

   ```dockerfile
   # infrastructure/caddy/Dockerfile
   FROM caddy:2-builder AS builder
   RUN xcaddy build --with github.com/caddy-dns/cloudflare

   FROM caddy:2-alpine
   COPY --from=builder /usr/bin/caddy /usr/bin/caddy
   ```

   Then point `docker-compose.prod.yml`'s `caddy` service at
   `build: ./infrastructure/caddy` instead of `image: caddy:2-alpine`, and
   `docker compose -f docker-compose.prod.yml --env-file .env.production
   build caddy`.

2. **Add the DNS provider's global option and API token to the Caddyfile.**
   At the very top of `infrastructure/caddy/Caddyfile`, before any site
   block:

   ```caddyfile
   {
   	acme_dns cloudflare {env.CF_API_TOKEN}
   }
   ```

   Add `CF_API_TOKEN=<a token scoped to Zone:DNS:Edit for this domain
   only>` to `.env.production`, and pass it through to the `caddy` service
   in `docker-compose.prod.yml` (`environment: - CF_API_TOKEN`).

3. **Uncomment the wildcard site block** in
   `infrastructure/caddy/Caddyfile` (`*.example.com { reverse_proxy
   web:3100 }`) and replace `beritabot.com`/`example.com` throughout the
   file with your real domain.

4. **Confirm the wildcard cert actually issues** before flipping the app
   flag on: `docker compose -f docker-compose.prod.yml --env-file
   .env.production up -d caddy` and watch `docker compose ... logs -f
   caddy` for a successful ACME DNS-01 completion for `*.example.com`.

5. **Assign at least one category a subdomain** in the admin dashboard
   (Categories → edit a category → Subdomain field) before turning the
   feature on — otherwise there's nothing to test.

6. **Flip the flag and restart:**

   ```bash
   # .env.production
   ENABLE_CATEGORY_SUBDOMAINS=true
   ```
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production restart web
   ```

   `apps/web/proxy.ts` reads this at request time from `process.env`
   inside the running container, so a `restart` (not a rebuild) is enough
   — unlike the `NEXT_PUBLIC_*` build-time vars in §6.

**Rollback:** set `ENABLE_CATEGORY_SUBDOMAINS=false` and `restart web`.
Every URL-building helper (`apps/web/lib/site-url.ts`,
`apps/api/src/common/url/site-url.util.ts`) falls back to the apex
`/category/:slug` and `/news/:slug` form the instant the flag is off, with
no other state to clean up — category subdomain values already saved on
categories are simply ignored again, not deleted.

---

## 8. Verify the deployment

```bash
curl https://api.example.com/api/v1/health
curl https://api.example.com/api/v1/health/ready
curl -I https://app.example.com/login
```

`health/ready` returns a non-200 status if Postgres/Redis aren't actually
reachable from the API container — a plain 200 with `"status":"ok"` means
the whole chain (Caddy → api → Postgres/Redis) is working.

If `health/ready` fails: `docker compose -f docker-compose.prod.yml
--env-file .env.production logs api` is almost always where the real error
is (wrong password, RLS role missing, Redis auth failure).

---

## 9. First-run setup

Public self-registration is disabled in this app (an earlier deliberate
security decision — new users are invited by an existing admin, not signed
up openly), so there's no `/register` page to visit. Bootstrap the first
organization and admin account via the seed script instead:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm api-migrate sh -c "cd apps/api && npx ts-node prisma/seed.ts"
```

This creates a "Demo Organization" and an admin user with the **hardcoded**
credentials `admin@demo.local` / `Admin123!` (see `apps/api/prisma/seed.ts`)
— fine for confirming everything works, not safe to leave as-is on a
publicly reachable server. Immediately after your first successful login:

1. Change that account's password (Account settings in the dashboard, or
   `POST /api/v1/auth/change-password`) to something real.
2. Rename the organization and update its details (Site Settings) to match
   your actual publication, not "Demo Organization".
3. Copy the organization's ID from Site Settings into `PUBLIC_SITE_ORG_ID`
   in `.env.production` if you want the public reader site to actually
   serve its published articles — it 404s on every public route until this
   is set.
4. `docker compose -f docker-compose.prod.yml --env-file .env.production
   restart api` to pick up the `PUBLIC_SITE_ORG_ID` change (env vars are
   read at process start, not live).
5. Invite any other editors/writers you need from Users & Roles — that
   screen is where new accounts are created now, not a public sign-up form.

---

## 10. Ongoing operations

### 10.1 Deploying a change

```bash
cd /opt/ainews-cms
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production build api web
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm api-migrate   # only if new migrations exist
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d api web
```

This is a brief-downtime restart, not a rolling deploy — acceptable for a
single-server setup. If that stops being acceptable, that's the signal
you've outgrown this guide (see `infrastructure/k8s/`, which does rolling
`Deployment` updates plus a separate one-shot migration `Job`).

### 10.2 Backups

The API has a built-in scheduled backup (`BackupSchedulerService`,
`BACKUP_INTERVAL_HOURS` in `.env.production`) that runs `pg_dump` and
writes to `BACKUP_DIR` inside the `api` container — which means those
backups live inside a container filesystem, not automatically off-server.
At minimum, mount `BACKUP_DIR` to a host path and copy it somewhere else
regularly:

```yaml
# add to the api service in docker-compose.prod.yml
volumes:
  - ./backups:/app/apps/api/backups
```

Then sync `./backups` off the server on a cron (to S3/R2, another host,
wherever) — a backup that only exists on the same disk as the database it
backs up doesn't protect against losing that disk.

### 10.3 Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f web
```

### 10.4 Monitoring

`docker-compose.prod.yml` intentionally doesn't include Prometheus/
Grafana/Alertmanager — bolt those on once you actually need alerting, using
`infrastructure/prometheus/` and `docs/DEVOPS.md` §7 as the reference (the
API already exposes `GET /metrics`; point Prometheus at
`http://api:4000/metrics` and set `METRICS_TOKEN` in `.env.production` so
it's not left openly readable).

Set `SENTRY_DSN` in `.env.production` if you want error tracking — the app
logs a loud warning on every boot in production if it's left unset, since
otherwise server errors go completely unreported.

---

## 11. Troubleshooting

**Images don't load / `next/image` returns 400** — either
`NEXT_PUBLIC_MEDIA_URL` doesn't match where media is actually served from
(rebuild `web` after fixing it — see §6's note on build-time vars), or
you're pointing at a hostname that resolves to a private/local IP without
the dev-only escape hatch (`dangerouslyAllowLocalIP`, which is deliberately
off in production — see `apps/web/next.config.ts`). In production this
almost always means `S3_PUBLIC_URL`/`NEXT_PUBLIC_MEDIA_URL` is wrong, not a
bug in the guard itself.

**API returns 500 on every request touching the database** — check that
`ainews_app`'s password in `DATABASE_URL` actually matches what
`infrastructure/postgres/init.sql` created (§5.1). A wrong password here
manifests as generic connection errors, not an obviously-auth-related one.

**Public reader site 404s everywhere** — `PUBLIC_SITE_ORG_ID` isn't set, or
was set before an `api` restart picked it up (§9).

**Caddy won't get a certificate** — the domain's DNS `A` record isn't
pointing at this server yet, or ports 80/443 aren't actually reachable
(check `ufw status`, and check your cloud provider's own firewall/security
group too — some providers block inbound traffic at the network level
separately from the OS firewall).

**Caddy won't get a certificate for `*.example.com` specifically** (while
`app.`/`api.` work fine) — this is expected with the stock `caddy:2-alpine`
image; a wildcard cert requires the DNS-01 setup in §7.1 (custom image +
DNS provider module + `acme_dns` block), not just DNS pointing at the
server. Check `docker compose ... logs caddy` for the specific ACME error
(wrong API token scope is the most common one).

**A category subdomain 404s even though the category has one assigned** —
either `ENABLE_CATEGORY_SUBDOMAINS` is still `false`/not yet restarted
(§7.1 step 6), or the category is not `isActive` (an inactive category's
subdomain is deliberately unreachable — see the admin category form).

**`api-migrate` hangs or fails** — almost always Postgres not yet healthy;
`depends_on: condition: service_healthy` should prevent this, but if you
ran `api-migrate` manually right after `docker compose up` rather than
waiting, give Postgres a few more seconds and retry.

**`docker compose ps` shows `api`/`web` as `unhealthy` even though the app
works fine** — if you've customized the healthcheck commands, make sure
they hit `127.0.0.1`, not `localhost`. Both containers only bind the IPv4
wildcard; Alpine's `wget` resolves `localhost` to `::1` first and never
falls back to IPv4, so it reports connection refused forever even with a
perfectly healthy app underneath. `docker-compose.prod.yml`'s own
healthchecks already use `127.0.0.1` for exactly this reason.

# Prometheus + Alertmanager

Closes the gap DEVOPS.md §7.1 names ("Application → Prometheus → Grafana →
Alertmanager → PagerDuty") but never had any actual rules or Alertmanager
config behind it — `/metrics` was scraped-but-unconsumed. Verified locally:
both containers healthy, all 5 rules load with no PromQL errors, and
Prometheus confirms it can reach Alertmanager.

## What's here

| File | Purpose |
|---|---|
| `prometheus.yml` | Scrape config - polls the API's `/metrics` every 15s (`host.docker.internal:4000`, since the API runs via `pnpm dev` on the host, not in this compose stack) |
| `alert-rules.yml` | 5 rules against the metrics the API actually exposes: service down, 5xx rate > 5%, p95 latency > 2s, event loop lag p99 > 100ms, resident memory > 1GB |
| `alertmanager.yml` | Routes alerts to a `default` receiver with **no real notification integration wired in** - it starts and runs cleanly, but currently just drops notifications silently |

## Running it

```bash
docker compose up -d prometheus alertmanager
```

- Prometheus UI: http://localhost:9090 (Alerts tab shows rule state)
- Alertmanager UI: http://localhost:9093

## Before relying on this in production

`alertmanager.yml`'s `default` receiver has no `slack_configs`/
`pagerduty_configs`/etc. - add one (examples are commented in the file)
before treating a firing alert as something a human will actually see.

If the API moves into this same compose stack (or a real cluster) instead
of running on the host, update `prometheus.yml`'s scrape target from
`host.docker.internal:4000` to whatever the real service address is.

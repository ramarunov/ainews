# Kubernetes manifests

Basic Deployment/Service/HPA/Ingress manifests for `api` and `web`, aligned
with SAD.md §8.2. This is a starting point for a real cluster, not a
turnkey production setup — see "Deliberately not included" below.

## What's here

| File | Purpose |
|---|---|
| `namespace.yaml` | `ainews-cms` namespace |
| `configmap.yaml` | Non-secret runtime config, shared by both Deployments |
| `secret.example.yaml` | **Template only.** Shows every key the app expects; do not fill in and commit — see the warning in the file |
| `api-deployment.yaml`, `api-service.yaml`, `api-hpa.yaml` | NestJS API: 2-8 replicas, CPU+memory-based autoscaling, liveness/readiness against `/api/v1/health` |
| `web-deployment.yaml`, `web-service.yaml`, `web-hpa.yaml` | Next.js frontend (standalone output): 2-6 replicas, CPU-based autoscaling |
| `migration-job.yaml` | One-shot `prisma migrate deploy` Job — run before rolling out a new `api` image, not on every pod start |
| `ingress.yaml` | nginx + cert-manager routing for both hosts |

## Deliberately not included

- **Postgres / Redis / OpenSearch / object storage StatefulSets.** Hand-
  rolling stateful data services in raw K8s manifests (replication, backups,
  PVC sizing, failover) is a project of its own and easy to get wrong in
  ways that lose data. Use a managed service (RDS/Cloud SQL, ElastiCache/
  Memorystore, an OpenSearch/Elasticsearch managed offering, S3) or an
  operator-backed Helm chart (Bitnami postgresql/redis, the OpenSearch
  Operator) instead, and point `configmap.yaml`/`secret.example.yaml` at
  those endpoints.
- **Registry push, staging/production deploy, the CI `DeployStaging` →
  `ManualApprovalGate` → `DeployProduction` → smoke-test → rollback stages
  from SAD.md §8.3.** These need real cloud/registry credentials that
  don't exist in this environment. `.github/workflows/api-ci.yml` now
  builds and Trivy-scans both images (see below) but stops there.
- **A separate `worker` Deployment.** SAD.md's diagram includes one for
  BullMQ job processing, but a repo-wide search found `BullModule`
  registered as a producer only — no `@Processor`/`@Process()` consumer
  class exists yet. There's no separate process to deploy until that
  feature is actually built; adding an empty worker Deployment now would
  misrepresent capability that doesn't exist.

## Usage

```bash
# From the repo root — build context must be the monorepo root, not apps/*
docker build -f apps/api/Dockerfile -t ainews-api:latest .
docker build -f apps/web/Dockerfile -t ainews-web:latest \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_MEDIA_URL=https://media.example.com/ainews-media \
  --build-arg NEXT_PUBLIC_SITE_URL=https://app.example.com .

kubectl apply -f infrastructure/k8s/namespace.yaml
kubectl apply -f infrastructure/k8s/configmap.yaml
# Create the real secret out-of-band instead of applying secret.example.yaml directly:
kubectl create secret generic ainews-secrets -n ainews-cms --from-env-file=.env.production

kubectl apply -f infrastructure/k8s/migration-job.yaml
kubectl wait --for=condition=complete job/api-migrate -n ainews-cms --timeout=120s
kubectl delete job/api-migrate -n ainews-cms

kubectl apply -f infrastructure/k8s/api-deployment.yaml -f infrastructure/k8s/api-service.yaml -f infrastructure/k8s/api-hpa.yaml
kubectl apply -f infrastructure/k8s/web-deployment.yaml -f infrastructure/k8s/web-service.yaml -f infrastructure/k8s/web-hpa.yaml
kubectl apply -f infrastructure/k8s/ingress.yaml
```

# Security Document
## AI Native News CMS — Enterprise Edition
**Version:** 1.0.0  
**Date:** 2026-07-08  
**Classification:** Internal — Engineering

---

## 1. Security Posture

The platform targets **SOC 2 Type II** readiness from day one. All OWASP Top 10 vulnerabilities are mitigated by design.

---

## 2. Authentication Security

### 2.1 Password Policy
- Minimum 12 characters
- bcrypt hash (cost factor 12, upgrade path to 14 for future hardware)
- Breach detection via HaveIBeenPwned API (k-anonymity check)
- Password history (last 5 passwords prohibited)

### 2.2 JWT Security
- **Algorithm:** RS256 (asymmetric) — private key signs, public key verifies
- **Access Token Lifetime:** 15 minutes (short-lived)
- **Refresh Token:** Opaque 256-bit random token stored as SHA-256 hash in Redis
- **Token Rotation:** Refresh token rotated on every use (detect token theft via family tracking)
- **Revocation:** Refresh tokens can be immediately revoked server-side

### 2.3 MFA Implementation
- TOTP (RFC 6238) via `otplib`
- 6-digit codes, 30-second window
- HMAC-SHA1 algorithm (standard compatibility)
- 10 single-use backup codes (stored as bcrypt hashes)
- Recovery requires backup code + email verification

### 2.4 Account Protection
- Rate limit: 5 failed attempts per 15 minutes per IP
- Progressive lockout: 15m → 1h → 24h
- Suspicious login alerts (new IP, new country)
- Session management: list and revoke active sessions

---

## 3. Authorization Security

### 3.1 RBAC Implementation
```
User → UserRole → Role → Permission → Resource
```

Permissions use `{resource}:{action}` format:
- `articles:read`
- `articles:write`
- `articles:publish`
- `articles:delete`
- `users:manage`
- `analytics:read`
- `settings:write`
- `ai:use`
- `plugins:manage`

Checks occur at:
1. Route guard level (coarse — "can access this endpoint?")
2. Service level (fine-grained — "can edit THIS article?")

### 3.2 Resource Ownership Rules
- Users can only edit articles they authored (unless role = editor/admin)
- Tenant isolation enforced at every query
- Organization context required for all tenant-scoped operations

---

## 4. API Security

### 4.1 Request Pipeline Security

```
Incoming Request
│
├─ SSL/TLS (terminated at load balancer, internal HTTP)
├─ Helmet.js headers:
│   ├─ Content-Security-Policy
│   ├─ Strict-Transport-Security (HSTS, max-age=31536000)
│   ├─ X-Frame-Options: DENY
│   ├─ X-Content-Type-Options: nosniff
│   ├─ Referrer-Policy: strict-origin-when-cross-origin
│   └─ Permissions-Policy
├─ CORS (allowlist of origins)
├─ Rate Limiting (Redis sliding window)
├─ Request Size Limit (10MB default)
├─ JWT Authentication
├─ RBAC Authorization
├─ Input Validation (class-validator)
├─ Input Sanitization (HTML → DOMPurify, SQL → Prisma parameterized)
└─ Handler
```

### 4.2 Content Security Policy

```
default-src 'self';
script-src 'self' 'nonce-{random}';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://api.ainews.local;
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

### 4.3 Rate Limiting Strategy

| Endpoint Type | Window | Limit |
|---------------|--------|-------|
| Login | 15 min | 5 per IP |
| Registration | 1 hour | 10 per IP |
| Password reset | 1 hour | 3 per email |
| API (authenticated) | 1 min | 100 per user |
| API (unauthenticated) | 1 min | 20 per IP |
| AI operations | 1 min | 20 per org |
| File upload | 1 min | 10 per user |
| Webhooks (inbound) | 1 min | 100 per source |

---

## 5. Data Security

### 5.1 Encryption at Rest
- Database: PostgreSQL TDE or disk-level encryption (AWS RDS encrypted volumes)
- Redis: Redis Enterprise Encryption at Rest (or filesystem encryption)
- S3: Server-side encryption (SSE-S3 or SSE-KMS)
- Backups: AES-256 encrypted before upload

### 5.2 Encryption in Transit
- All external traffic: TLS 1.3 minimum (TLS 1.2 allowed for compatibility)
- Internal service-to-service: mTLS in production Kubernetes
- Database connections: SSL required (`?sslmode=require`)

### 5.3 Sensitive Data Handling
- API keys stored as `{prefix}_{SHA-256 hash}`; only prefix shown in UI
- MFA secrets encrypted with application-level encryption key (AES-256-GCM)
- OAuth tokens encrypted at rest
- PII data fields identified and subject to GDPR controls
- Passwords NEVER logged, NEVER returned in API responses

### 5.4 Secrets Management
- Development: `.env` file (never committed)
- CI/CD: GitHub Actions Encrypted Secrets
- Production: HashiCorp Vault or AWS Secrets Manager
- No hardcoded credentials anywhere in codebase
- Automated secret rotation for database passwords and API keys

---

## 6. Input Validation & Injection Prevention

### 6.1 SQL Injection
- **Prevention:** All database queries via Prisma ORM (parameterized queries)
- No raw SQL in application code (audit enforced)
- Exception: Prisma `$queryRaw` requires sanitization review

### 6.2 XSS Prevention
- API: All user-provided HTML sanitized via `isomorphic-dompurify` with strict allowlist
- React: JSX auto-escaping for text nodes
- `dangerouslySetInnerHTML` prohibited without sanitization wrapper
- Rich editor: Tiptap sanitizes on import and export

### 6.3 CSRF Protection
- SameSite=Strict cookies
- Double-submit cookie pattern for stateful flows
- CSRF token required for state-changing requests from browser clients

### 6.4 Path Traversal
- All file paths normalized and validated against allowed directories
- S3 keys generated server-side; client never specifies storage path

### 6.5 XML/XXE
- XML parsing with external entity resolution disabled
- RSS parsing uses `rss-parser` with XXE protections

---

## 7. Infrastructure Security

### 7.1 Container Security
- Non-root user in all Docker containers
- Read-only root filesystem where possible
- No privileged containers
- Minimal base images (Alpine or Distroless)
- No secrets in environment variables for production (use mounted secrets)
- Image vulnerability scanning: Trivy in CI pipeline

### 7.2 Kubernetes Security
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

- Network Policies: default-deny, explicit allow
- Pod Security Standards: Restricted
- RBAC: Principle of least privilege
- Secrets: Sealed Secrets or External Secrets Operator

### 7.3 Network Security
- All pods in private subnets
- Load balancer only in public subnet
- VPC flow logs enabled
- Web Application Firewall (WAF) in front of load balancer
- DDoS protection: Cloudflare or AWS Shield

---

## 8. Audit & Monitoring

### 8.1 Audit Logging
Every state-changing operation records:
- WHO (user ID, IP, user agent)
- WHAT (action, entity type, entity ID)
- WHEN (timestamp with timezone)
- BEFORE/AFTER (JSON diff of changed fields)
- WHY (request ID for tracing)

Audit logs are:
- Written to append-only partitioned table
- Exported to immutable cold storage (S3) after 30 days
- Retained for 7 years (regulatory compliance)
- Accessible to organization admins via API (read-only)

### 8.2 Security Monitoring

Real-time alerts for:
- Multiple failed login attempts
- JWT validation failures (token tampering)
- Rate limit breaches
- Unusual access patterns (off-hours, new geolocation)
- Privilege escalation attempts
- Admin actions (bulk delete, role changes)

### 8.3 Incident Response Playbooks

| Incident | Detection | Response |
|----------|-----------|----------|
| Credential stuffing | High login failures | Auto-block IPs, force password reset |
| Data exfiltration | Unusual bulk export | Alert + automatic session revocation |
| JWT compromise | Rotated tokens reused | Revoke token family, force re-auth |
| Dependency vulnerability | CVE scan in CI | Immediate patch PR, block deploy if critical |

---

## 9. GDPR Compliance

### 9.1 Data Subject Rights
- **Right to Access:** API endpoint to export all user data (JSON)
- **Right to Erasure:** Pseudonymization of PII (keep audit trail integrity); hard delete where no legal retention applies
- **Right to Portability:** Export in machine-readable format
- **Right to Rectification:** Self-service profile update

### 9.2 Data Processing Records
Maintained per GDPR Article 30:
- What personal data is collected
- Processing purpose and legal basis
- Retention periods
- Third-party processors (AI providers, email, CDN)

### 9.3 Third-Party AI Data Handling
- AI providers must not use submitted content for training
- Data processing agreements (DPAs) required with all AI providers
- Content anonymization option before AI processing
- On-premise Ollama option for full data residency

---

## 10. Penetration Testing & Vulnerability Management

### 10.1 Automated Scanning (CI/CD)
- `npm audit` — dependency vulnerabilities
- `Trivy` — container image CVE scan
- `ESLint security` plugin — code-level security rules
- `Semgrep` — SAST (Static Application Security Testing)

### 10.2 Manual Reviews
- Quarterly security code review
- Annual third-party penetration test
- Bug bounty program (post-launch)

### 10.3 Patch Policy
| Severity | Max Time to Patch |
|----------|-----------------|
| Critical | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | 90 days |

---

*Security concerns should be reported to security@ainews.local. Never file security issues in public issue trackers.*

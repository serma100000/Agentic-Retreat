# ADR-006: GDPR-by-Design Data Minimization and Privacy Architecture

## Status

**Accepted** -- March 2026

## Context

OpenPulse is a crowdsourced outage detection platform that collects data from potentially millions of users globally. The platform inherently receives information about users' internet usage patterns (which services they use, when they experience problems, their approximate geographic location). This creates significant privacy obligations and risks:

1. **Regulatory compliance**: GDPR (EU), CCPA (California), and emerging privacy regulations worldwide impose strict requirements on personal data collection, processing, storage, and deletion. Non-compliance carries severe penalties (GDPR fines up to 4% of global annual revenue or EUR 20 million).

2. **User trust**: The platform's value depends on users willingly submitting outage reports. If users perceive the platform as invasive or data-hungry, participation will decline, degrading detection quality.

3. **Data breach risk**: Every piece of stored personal data is a liability in the event of a security breach. Minimizing stored PII minimizes breach impact.

4. **Open data philosophy**: OpenPulse intends to publish aggregated, anonymized outage data under an open license (see ADR-007). The data pipeline must ensure that no PII can leak into public datasets.

5. **Anti-abuse requirements**: The platform must detect and prevent coordinated report manipulation (see ADR-010), which requires some form of device/user identification. This creates tension with data minimization.

6. **Crowdsourced platform precedent**: Downdetector's privacy practices are opaque ("Unknown" GDPR compliance in competitive analysis). OpenPulse has an opportunity to set a higher standard and differentiate through transparent, privacy-respecting data practices.

The fundamental design tension is between collecting enough data to provide accurate, abuse-resistant outage detection and minimizing data collection to protect user privacy.

## Decision

We will implement a **privacy-by-design architecture** with aggressive data minimization as the default, making PII collection unnecessary for the core reporting function and strictly limiting all personal data to defined purposes with enforced retention limits.

### Data Minimization by Default

**Report submission requires zero PII**:

The minimum fields for an outage report are:
- Service ID (which service is affected)
- Report type (outage / degraded / operational)
- Timestamp (server-generated)
- Approximate geographic region (derived from IP at the edge, city-level granularity)

No name, email, account, device ID, or other PII is required to submit a report. Anonymous reporting is the default and primary path.

### Transient IP Address Usage

IP addresses are used for three purposes and then discarded:

1. **Geo-enrichment**: At the edge (Cloudflare Workers), the IP is resolved to approximate geographic location (city, region, country, ASN). The IP itself is not forwarded to origin services; only the derived geographic data is included in the report event.

2. **Rate limiting**: Per-IP rate limits (10 reports/minute) are enforced at the edge using Cloudflare's infrastructure. Rate limit state is maintained at the edge and expires within minutes; IPs are not logged or stored.

3. **Abuse detection**: IP reputation scoring is performed at the edge against maintained blocklists. No IP addresses are stored in the persistent data tier.

**Enforcement**: IP addresses never enter the Redpanda event stream, the detection engine, or any persistent database. The edge worker strips IPs before forwarding events to origin.

### Hashed Device Fingerprints

For anti-abuse purposes (detecting coordinated manipulation), a lightweight device fingerprint is computed from browser/device characteristics:

- The raw fingerprint is immediately one-way hashed (SHA-256 with a rotating salt)
- The hashed fingerprint is stored in Redis with a **24-hour TTL** (time-to-live)
- After 24 hours, the fingerprint hash is automatically deleted
- Fingerprint hashes are used exclusively for:
  - Deduplication (same device, same service, within time window)
  - Rate limiting (per-device report rate)
  - Behavioral analysis (detecting uniform submission patterns)
- Fingerprint hashes are never correlated with accounts, never exported, and never included in public data

**Rotating salt**: The hash salt rotates every 24 hours, ensuring that fingerprint hashes cannot be correlated across days even if the hash store is compromised.

### Optional Accounts

Account creation is entirely optional and provides only enhanced features:

| Feature | Anonymous | Account |
|---------|-----------|---------|
| Submit reports | Yes | Yes |
| View outage data | Yes | Yes |
| API access (read) | Yes (rate limited) | Yes (higher limits) |
| Notification preferences | No | Yes |
| Report history (personal) | No | Yes |
| Reputation scoring | No | Yes (improves report weight) |
| API access (write) | No | Yes (API key) |

**Account data stored**:
- Email address: stored as a salted bcrypt hash for authentication; the plaintext email is used only for sending notifications and is not stored in the primary database
- Display name: optional, user-chosen
- Notification preferences: email, webhook, Slack, Discord, etc.
- API keys: hashed, scoped, revocable

**No password authentication**: Accounts authenticate via OAuth 2.0 with PKCE or WebAuthn/passkeys. No password storage.

### Data Retention Policies

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Raw report events | 90 days | Detection accuracy analysis and model training |
| Aggregated report counts | Indefinite | Public outage history (no PII) |
| Device fingerprint hashes | 24 hours | Anti-abuse only |
| IP addresses | Transient (edge only) | Never stored persistently |
| Account data | Until deletion requested | User-controlled |
| Probe results | 1 year | Historical analysis (no PII) |
| Social media signals | 30 days (raw), indefinite (aggregated) | NLP model training; raw posts are third-party content |
| Audit logs | 2 years | Security and compliance |

### Right to Erasure (GDPR Article 17)

- Account deletion is self-service and immediate for account data
- Historical reports from the account are disassociated (anonymized) rather than deleted, preserving aggregate data integrity
- A deletion confirmation is issued within 72 hours
- Deletion propagates to all data stores (PostgreSQL, Redis, Elasticsearch, backups) within 30 days

### Data Processing Agreements

- All third-party data processors (Cloudflare, cloud hosting) are covered by DPAs
- Data residency preferences are supported: EU users' account data can be stored in EU-region databases
- No personal data is transferred to countries without adequate data protection without appropriate safeguards (Standard Contractual Clauses)

### Technical Enforcement

Privacy controls are enforced architecturally, not just by policy:

1. **Edge stripping**: The Cloudflare Worker edge tier physically strips IP addresses before forwarding to origin. Even a compromised origin service cannot access user IPs.

2. **Schema validation**: The Redpanda event schema for reports does not include IP address fields. A report event physically cannot contain an IP.

3. **TTL enforcement**: Redis automatically expires fingerprint hashes after 24 hours. No application logic is required for deletion.

4. **Audit logging**: All access to personal data (account lookups, email decryption for notification sending) is logged with purpose, accessor, and timestamp.

5. **Encryption at rest**: All databases storing personal data (PostgreSQL accounts table) use AES-256 encryption at rest.

6. **Encryption in transit**: All internal service communication uses mTLS. External communication uses TLS 1.3 with HSTS.

## Consequences

### Positive

1. **GDPR compliance by architecture**: Data minimization is the strongest defense against GDPR enforcement actions. By not collecting PII for core functionality, the platform avoids most data protection obligations for the majority of its data.

2. **Minimal breach impact**: If the report database is compromised, it contains no PII -- only service IDs, timestamps, report types, and city-level geographic regions. The blast radius of a data breach is dramatically reduced.

3. **User trust and adoption**: Transparent, minimal data collection lowers the barrier to participation. Users uncomfortable with creating accounts can still contribute valuable outage reports anonymously.

4. **Open data compatibility**: Aggregated report data can be published publicly (ADR-007) with confidence that no PII is embedded, because PII was never collected in the first place.

5. **Reduced compliance overhead**: No need for cookie consent banners for anonymous reporting (no tracking cookies). No need for data processing consent for the core function (legitimate interest basis for anonymous, aggregated outage monitoring).

6. **Competitive differentiation**: OpenPulse's transparent, privacy-first approach differentiates it from Downdetector and other platforms with opaque privacy practices.

### Negative

1. **Reduced abuse detection capability**: Without persistent device identifiers or mandatory accounts, sophisticated manipulation campaigns are harder to detect. The 24-hour fingerprint TTL limits long-term behavioral analysis. ADR-010 addresses this with complementary abuse prevention measures.

2. **No personalized experience for anonymous users**: Without accounts, the platform cannot offer personalized dashboards, saved service lists, or notification preferences to anonymous users.

3. **Reputation system limitations**: The reputation scoring system (higher-weight reports from historically accurate users) only works for account holders. Anonymous reports receive baseline weighting.

4. **Forensic investigation limitations**: If a coordinated manipulation campaign is detected days after the fact, the 24-hour fingerprint TTL means the original device data is already deleted. Aggregate behavioral patterns may be the only evidence available.

5. **Operational complexity**: Enforcing data minimization across multiple services and data stores requires architectural discipline. Every new feature must be evaluated for privacy impact.

## Alternatives Considered

### Alternative 1: Full Data Collection with Opt-Out

Collect comprehensive user data (IP addresses, precise location, device details, browsing patterns) by default, with an opt-out mechanism for users who object.

**Rejected because:**
- Violates GDPR's data minimization principle (Article 5(1)(c)) which requires that data collection be "adequate, relevant, and limited to what is necessary"
- Opt-out models have low engagement; most users never change default settings, resulting in unnecessary PII accumulation
- Every stored piece of PII is a breach liability
- Conflicts with the open-source, trust-based community philosophy
- Requires comprehensive cookie consent mechanisms and data processing consent flows

### Alternative 2: Anonymous-Only (No Accounts)

Prohibit account creation entirely; all interaction with the platform is anonymous.

**Rejected because:**
- Eliminates the ability to offer notifications, saved preferences, and API key management
- Destroys the reputation system; all reports receive equal weight regardless of historical accuracy
- Makes abuse prevention significantly harder with no concept of user identity
- Removes the revenue path for paid tiers (accounts are needed for subscription management)
- However, the decision to make accounts optional preserves the anonymous-first philosophy while enabling enhanced features for users who choose to create accounts

### Alternative 3: Third-Party Auth Only (Google/GitHub SSO)

Require authentication via third-party OAuth providers, outsourcing identity management entirely.

**Rejected because:**
- Requires an account to submit reports, creating a participation barrier that degrades crowdsourced data quality
- Delegates privacy trust to third parties (users must trust Google/GitHub with their OpenPulse usage patterns)
- Third-party auth providers may change terms, restrict API access, or discontinue service
- However, third-party OAuth is supported as one authentication option for account creation, alongside WebAuthn/passkeys

## References

- OpenPulse Research Document, Section 7.1 (Data Minimization)
- OpenPulse Research Document, Section 7.2 (Security Architecture)
- OpenPulse Research Document, Section 7.3 (Abuse Prevention)
- GDPR Article 5(1)(c) (Data Minimization Principle)
- GDPR Article 17 (Right to Erasure)
- GDPR Article 25 (Data Protection by Design and by Default)

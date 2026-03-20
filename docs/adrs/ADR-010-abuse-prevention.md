# ADR-010: Multi-Layered Abuse Prevention for Crowdsourced Reporting

## Status

**Accepted** -- March 2026

## Context

OpenPulse is fundamentally a crowdsourced platform: its outage detection accuracy depends on the integrity of user-submitted reports. This creates an inherent vulnerability that does not exist in purely probe-based or status-page-based monitoring systems.

Potential attack vectors include:

1. **Coordinated false reporting**: A group of actors (or a botnet) submits a large volume of outage reports for a service that is actually operational, attempting to fabricate an outage signal. Motivations include competitive sabotage, stock manipulation, or reputational damage.

2. **Outage suppression**: Actors submit "operational" reports during a genuine outage to dilute the outage signal, potentially to delay public awareness while mitigating the impact internally.

3. **Automated mass reporting**: Bots programmatically submit reports at scale, overwhelming the detection engine with noise.

4. **Report manipulation for attention**: Users or organizations submit false reports to drive traffic to their service's page on the platform, exploiting OpenPulse as a publicity mechanism.

5. **Data poisoning**: Systematic submission of misleading reports to degrade the ML training data, reducing the accuracy of the detection models over time.

The privacy-by-design architecture (ADR-006) complicates abuse prevention because:
- Anonymous reporting is the default and primary path
- IP addresses are not stored persistently
- Device fingerprints are hashed with a 24-hour TTL
- No mandatory account creation

This creates a tension: effective abuse prevention traditionally relies on persistent identity tracking, but the privacy architecture deliberately minimizes identity data.

Downdetector's approach to this problem is not publicly documented, but its consumer-first design and lack of active probing make it particularly susceptible to report inflation and mob effects, as widely observed during high-profile events.

## Decision

We will implement a **multi-layered abuse prevention system** combining proof-of-work, behavioral analysis, reputation scoring, and canary services.

### Layer 1: Proof-of-Work for Anonymous Reports

Anonymous report submissions (without an authenticated account) require solving a lightweight computational challenge before the report is accepted.

**Implementation**:
- A Hashcash-style proof-of-work challenge is issued by the edge worker when a report submission begins
- The client must find a nonce such that SHA-256(challenge + nonce) has N leading zero bits
- Difficulty is calibrated so that solving takes approximately 100-500ms on a modern consumer device
- The solved proof is submitted alongside the report and verified at the edge (< 1ms verification)

**Rationale**:
- A human user submitting a legitimate report waits 100-500ms (imperceptible in the context of form submission)
- An attacker attempting to submit 10,000 false reports must expend 10,000x the computational work, making large-scale automated reporting economically impractical
- No persistent identity data is required; the proof-of-work is self-contained

**Adaptive difficulty**:
- During confirmed outages (DEGRADED or MAJOR_OUTAGE state), proof-of-work difficulty is reduced to lower the barrier for legitimate surge reporting
- During OPERATIONAL state, difficulty can be increased for services that have been targeted by manipulation attempts
- Mobile clients can use a reduced difficulty to account for lower computational power

### Layer 2: Behavioral Analysis

ML-based detection of coordinated reporting campaigns operates on aggregate patterns rather than individual user tracking.

**Signals analyzed**:
- **Temporal uniformity**: Legitimate report surges follow a characteristic curve (exponential rise, plateau, gradual decline). Coordinated campaigns often produce unnaturally uniform report rates (constant reports/second over extended periods)
- **Geographic clustering**: Legitimate outage reports follow the geographic distribution of the service's user base. Coordinated campaigns often originate from a narrow set of geographic regions or ASNs
- **Metadata homogeneity**: Reports from a coordinated campaign often share identical or highly similar metadata patterns (browser fingerprint characteristics, User-Agent strings, referrer patterns)
- **Report type distribution**: During genuine outages, report types vary (outage, degraded, intermittent). Coordinated campaigns tend to submit a single report type uniformly
- **Timing correlation with external events**: Report surges that coincide with social media posts about a service but not with probe degradation suggest mob-effect inflation rather than genuine outages

**Implementation**:
- A lightweight anomaly detection model runs on aggregate report stream features (not individual reports)
- When coordinated behavior is detected, the affected reports are down-weighted in the detection engine rather than discarded (reducing their influence on confidence scores without losing legitimate signals that may be mixed in)
- Alerts are generated for human review when coordinated campaigns are detected with high confidence

### Layer 3: Reputation Scoring

Registered users (optional accounts) accumulate a reputation score based on the historical accuracy of their reports.

**Scoring model**:
- **Initial reputation**: New accounts start at a neutral score (1.0 weight)
- **Accuracy tracking**: After an outage is confirmed (reaching DEGRADED or MAJOR_OUTAGE state), reports submitted during the early detection window are marked as "accurate." Reports submitted for services that remained OPERATIONAL are marked as "inaccurate."
- **Score adjustment**: Accuracy and inaccuracy events adjust the reputation score using an exponential moving average, giving more weight to recent behavior
- **Report weighting**: Reports from high-reputation users contribute more strongly to the detection engine's confidence score. Reports from low-reputation users are down-weighted.
- **Score floor**: Reputation never drops below a minimum floor (0.1 weight) to prevent permanent exclusion of users who had a streak of bad luck
- **Score cap**: Reputation is capped at a maximum (3.0 weight) to prevent any single user from having outsized influence

**Benefits for the detection engine**:
- Early reports from high-reputation users can accelerate detection (their reports carry more weight in the Bayesian fusion)
- Reports from low-reputation users or anonymous users contribute less individually but collectively still provide valuable signal

### Layer 4: Canary Services

OpenPulse monitors a set of fictional/internal "canary" services that are not real internet services.

**Implementation**:
- Canary services are listed in the service catalog with realistic names and descriptions
- They are indistinguishable from real services to external observers
- Any reports submitted for canary services are, by definition, false reports
- Canary report patterns are analyzed to identify:
  - Automated reporting tools (which blindly report outages for all services)
  - Coordinated campaigns (which may target canary services alongside real targets)
  - Individual malicious reporters (if using accounts)

**Actions on canary trigger**:
- Device fingerprint hashes associated with canary reports are flagged
- If an account submits canary reports, its reputation score is heavily penalized
- IP ranges associated with canary report clusters are temporarily subjected to increased proof-of-work difficulty
- Intelligence gathered from canary patterns feeds back into the behavioral analysis model

### Layer 5: Rate Limiting (Defense in Depth)

Multi-tier rate limiting provides a baseline defense even if other layers are bypassed:

| Scope | Limit | Enforcement Point |
|-------|-------|-------------------|
| Per IP | 10 reports/minute | Edge (Cloudflare Workers) |
| Per device fingerprint | 20 reports/hour | Edge (Cloudflare Workers) |
| Per API key | Configurable per tier | API Gateway |
| Per service (global) | Dynamic ceiling based on historical baseline | Detection Engine |
| Adaptive | Limits increase during confirmed outages | Consensus Engine feedback |

The per-service global rate limit is a novel defense: if the total report rate for a service exceeds a multiple of its historical peak (e.g., 10x the highest previous legitimate surge), additional reports are queued and subjected to enhanced scrutiny rather than immediately counted.

### Integration with Multi-Signal Consensus

Abuse prevention integrates with the Bayesian consensus engine (ADR-005):

- Reports flagged as potentially coordinated receive reduced weight (lower likelihood ratio) in the Bayesian fusion
- If a report surge occurs without corroborating probe failures, social media signals, or status page updates, the consensus engine naturally assigns lower confidence to the outage hypothesis
- This means that even if abuse prevention mechanisms miss a coordinated campaign, the multi-signal architecture provides a natural defense: fabricated reports alone cannot push a service past INVESTIGATING status without corroborating evidence from independent signal sources

## Consequences

### Positive

1. **Defense in depth**: Five independent layers mean that bypassing one layer does not compromise the system. An attacker must simultaneously defeat proof-of-work, avoid behavioral detection patterns, build reputation over time, avoid canary services, and stay within rate limits.

2. **Privacy-compatible**: No layer requires persistent PII storage. Proof-of-work is stateless. Behavioral analysis operates on aggregates. Reputation scoring is tied to optional accounts. Canary detection uses transient fingerprint hashes.

3. **Proportional response**: Rather than binary accept/reject, the system adjusts report weights. This preserves legitimate signals that may be mixed with coordinated campaigns rather than discarding all reports during suspicious periods.

4. **Self-improving**: Canary service intelligence and behavioral analysis patterns feed back into the system, improving detection of future campaigns.

5. **Transparent**: The abuse prevention mechanisms can be documented publicly (the canary services' specific identities are the only secret) without reducing their effectiveness, unlike security-through-obscurity approaches.

6. **Low friction for legitimate users**: Proof-of-work adds < 500ms to report submission. All other layers are invisible to legitimate users.

### Negative

1. **Proof-of-work accessibility**: Users on very low-powered devices (older smartphones, embedded browsers) may experience longer proof-of-work computation times. Adaptive difficulty and reduced mobile difficulty mitigate this, but some edge cases remain.

2. **Behavioral analysis false positives**: Legitimate organic surges (e.g., a viral TikTok about a service being down) can resemble coordinated campaigns in their temporal and geographic patterns. Down-weighting these reports may briefly slow detection.

3. **Reputation gaming**: Sophisticated attackers could build reputation over months by submitting accurate reports during genuine outages, then exploit their accumulated reputation weight during a coordinated campaign. The reputation cap (3.0 max weight) limits the impact.

4. **Canary service maintenance**: Canary services must be maintained to remain indistinguishable from real services. If the canary list becomes public knowledge, their detection value is lost.

5. **Computational cost**: Proof-of-work verification, behavioral analysis, and reputation computation add processing overhead to the report ingestion pipeline, though the computational cost is modest compared to the ML detection layers.

6. **Cold-start period**: Behavioral analysis models need historical data to establish baselines. During the early operational period, these models will be less effective.

## Alternatives Considered

### Alternative 1: CAPTCHA-Only

Require CAPTCHA completion for all report submissions.

**Rejected because:**
- CAPTCHAs create significant user friction, reducing legitimate report submission rates and degrading crowdsourced data quality
- Modern CAPTCHA-solving services (2Captcha, Anti-Captcha) can solve CAPTCHAs at scale for approximately $1-3 per 1,000 solves, making them an ineffective barrier against motivated attackers
- CAPTCHAs are inaccessible to users with disabilities
- Third-party CAPTCHA services (reCAPTCHA, hCaptcha) introduce privacy concerns (tracking, data sharing with Google)
- CAPTCHA completion time (5-30 seconds) is orders of magnitude slower than proof-of-work (100-500ms), creating unacceptable friction during outage surges when report velocity is most valuable

### Alternative 2: Mandatory Account Creation for Reporting

Require all users to create an account before submitting reports.

**Rejected because:**
- Creates a significant participation barrier that would dramatically reduce the volume and geographic diversity of crowdsourced reports
- Account creation takes minutes; during an outage surge, users want to submit a report immediately, not go through registration
- Automated account creation is trivial for sophisticated attackers (disposable email services, automated registration)
- Conflicts with the privacy-by-design architecture (ADR-006) which makes anonymous reporting the default
- Reduces the platform's competitive advantage over Downdetector (which also does not require accounts for reporting)

### Alternative 3: IP Blocklists Only

Maintain lists of known malicious IPs (VPNs, proxies, data centers, known bot IPs) and reject reports from these addresses.

**Rejected because:**
- IP blocklists are trivially bypassed with residential proxy services that route through legitimate consumer IP addresses
- Blocking VPN and proxy IPs penalizes privacy-conscious legitimate users
- Static blocklists cannot detect novel attack sources
- IP-based blocking conflicts with the transient IP usage policy (ADR-006) since it requires maintaining persistent IP state
- However, IP reputation checking at the edge is used as one input to the behavioral analysis layer, not as a standalone defense

## References

- OpenPulse Research Document, Section 7.3 (Abuse Prevention)
- OpenPulse Research Document, Section 5.1 (Data Ingestion Pipeline -- Report Validation)
- OpenPulse Research Document, Section 7.1 (Data Minimization)
- OpenPulse Research Document, Section 9.2 (Competitive Differentiation)

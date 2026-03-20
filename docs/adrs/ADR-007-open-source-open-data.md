# ADR-007: AGPL-3.0 Open Source License with CC BY 4.0 Open Data

## Status

**Accepted** -- March 2026

## Context

OpenPulse aims to democratize outage intelligence -- the awareness and analysis of internet service disruptions that affect millions of users and cost businesses billions annually. Currently, outage data is a proprietary asset:

1. **Downdetector** (Ookla/Accenture) collects crowdsourced outage data from millions of users but does not make this data publicly available. API access is limited and expensive, restricted to Downdetector Enterprise subscribers.

2. **StatusGator** provides status page aggregation data behind paid subscriptions, with limited free-tier API access.

3. **No open dataset exists** for internet service outage patterns. Academic researchers studying internet reliability, cascading failures, or anomaly detection algorithms have no public dataset to work with.

This closed-data ecosystem creates several problems:

- **Academic research is stifled**: Researchers cannot validate anomaly detection algorithms against real outage data without expensive commercial data licenses or laboriously manual data collection.
- **No independent verification**: When Downdetector reports an outage, there is no way to independently verify or analyze the underlying data. Users must trust the platform's interpretation.
- **Innovation is concentrated**: Only well-funded companies can access outage intelligence, preventing startups, nonprofits, and independent developers from building on this data.
- **Community contribution is impossible**: Users contribute their reports but cannot access or improve the detection algorithms that process those reports.

OpenPulse's open-source, open-data philosophy is a core competitive differentiator (identified as Key Differentiator #3 in the research document). The licensing model must balance:

- Maximizing adoption and contribution
- Preventing proprietary forks that compete without contributing back
- Enabling commercial use of the data for research and integration
- Sustaining the project financially

## Decision

We will release OpenPulse under a dual-license structure:

### Platform Code: AGPL-3.0 (GNU Affero General Public License v3.0)

All platform source code -- services, detection algorithms, API layer, frontend, infrastructure configuration, and tooling -- is released under AGPL-3.0.

**Key properties of AGPL-3.0**:
- Anyone can use, modify, and distribute the software
- Anyone can self-host their own OpenPulse instance
- If a modified version is made available over a network (e.g., as a SaaS), the source code of the modifications must be made available under the same license
- Derivative works must also be AGPL-3.0 licensed

**Rationale for AGPL over MIT/Apache**:
- The "network copyleft" provision prevents a well-funded competitor from forking OpenPulse, adding proprietary improvements, and offering it as a competing SaaS without contributing improvements back to the community
- This is the specific failure mode that has undermined many permissively licensed open-source projects (e.g., AWS offering managed Elasticsearch without contributing to the upstream project)
- AGPL ensures that improvements to detection algorithms, new signal integrations, and performance optimizations made by any hosted deployment flow back to the community

### Outage Data: CC BY 4.0 (Creative Commons Attribution 4.0 International)

All aggregated, anonymized outage intelligence data produced by OpenPulse is published under CC BY 4.0.

**Published data includes**:
- Aggregated report counts per service, per time period, per geographic region
- Outage timeline events (state transitions with timestamps and confidence scores)
- Historical outage catalog with duration, severity, and affected regions
- Probe availability and latency statistics per service, per region
- Service dependency mappings (where detectable)

**Published data explicitly excludes**:
- Any PII (see ADR-006: no PII is collected for reports)
- Raw individual report events (only aggregates)
- Individual social media posts (only aggregate sentiment scores)
- Internal system metrics and configuration

**Key properties of CC BY 4.0**:
- Anyone can share and adapt the data for any purpose, including commercial use
- The only requirement is attribution (credit to OpenPulse as the data source)
- No "share-alike" restriction: derivative datasets can be released under any license
- Compatible with academic publishing and research data requirements

**Data distribution**:
- Real-time data available via the public API (rate-limited free tier, higher limits for paid tiers)
- Historical bulk data exports published monthly in Parquet format on object storage
- Academic research data access program with dedicated API allocation for verified researchers

### Contributor License Agreement (CLA)

Contributors to the OpenPulse codebase sign a Contributor License Agreement that:
- Grants the OpenPulse project a non-exclusive, irrevocable license to their contributions
- Enables the project to offer commercial licensing (OpenPulse Cloud, Enterprise) without requiring separate permission from every contributor
- Does not transfer copyright; contributors retain ownership of their contributions
- Uses the standard Developer Certificate of Origin (DCO) model for lightweight contribution

### Commercial Sustainability

The AGPL license is compatible with the revenue model described in the research document:

- **OpenPulse Cloud (hosted SaaS)**: The project itself operates the hosted version. No licensing conflict.
- **Enterprise On-Premises**: Organizations requiring private deployment and commercial support purchase a commercial license that includes SLA guarantees and support, offered as an alternative to the AGPL terms.
- **Data API tiers**: Higher API rate limits and custom data feeds are sold as services, not data licenses. The underlying data remains CC BY 4.0.

## Consequences

### Positive

1. **Community contributions flow back**: The AGPL copyleft ensures that any organization running a modified OpenPulse instance as a service must share their modifications. The community benefits from improvements made by all operators.

2. **Academic research enabled**: CC BY 4.0 data enables researchers to study internet reliability, validate anomaly detection algorithms, and publish findings using real outage data without licensing barriers.

3. **Ecosystem growth**: Open data and open APIs enable third-party developers to build integrations, dashboards, browser extensions, and tools that expand the OpenPulse ecosystem.

4. **Trust through transparency**: Users can audit the detection algorithms, verify that privacy commitments are upheld, and confirm that the platform operates as documented. This transparency builds trust that proprietary competitors cannot match.

5. **Self-hosting option**: Organizations with data sovereignty requirements or niche monitoring needs can deploy their own instance, contributing to the community while meeting their specific requirements.

6. **Federated deployment potential**: Multiple OpenPulse instances (organizational, regional) can share anonymized aggregate data while maintaining independent operation, creating a federated outage intelligence network.

7. **Competitive moat via community**: Unlike a proprietary codebase that can be replicated by a well-funded competitor, an active open-source community with network effects (shared detection improvements, community-maintained service catalog) creates a durable competitive advantage.

### Negative

1. **AGPL commercial hesitancy**: Some organizations are reluctant to use AGPL software due to concerns about the copyleft provisions affecting their own code. This may reduce adoption in certain enterprise environments. The commercial license offering mitigates this for organizations willing to pay.

2. **Contribution coordination overhead**: Managing an open-source community (code reviews, issue triage, release management, governance) requires dedicated effort and resources that a proprietary project would not need.

3. **Competitive intelligence leakage**: Open-sourcing detection algorithms means competitors can study and replicate the approach. However, the algorithms alone are not the competitive advantage -- the combination of algorithms, community, data network effects, and operational expertise is.

4. **Data quality dependency**: Open data means publishing data that may contain detection errors (false positives/negatives). These errors are visible to anyone, including critics. High detection quality must be maintained to protect reputation.

5. **Free rider risk**: Despite AGPL, organizations may use the platform internally (not as a network service) without contributing back. This is by design -- internal use is permitted and encouraged -- but means some beneficiaries do not contribute.

6. **License enforcement burden**: AGPL compliance requires monitoring for unauthorized proprietary forks. This is a legal and operational burden, though community members often identify violations.

## Alternatives Considered

### Alternative 1: Proprietary (Closed Source, Closed Data)

Traditional proprietary software and data model, similar to Downdetector.

**Rejected because:**
- Directly contradicts the mission of democratizing outage intelligence
- Eliminates community contributions and ecosystem growth
- Cannot compete with Downdetector/Accenture on resources; must compete on openness and community
- Users have no way to verify detection accuracy or privacy claims
- No academic research enablement

### Alternative 2: MIT or Apache 2.0 (Permissive License)

Permissive open-source license allowing proprietary forks and modifications.

**Rejected because:**
- Enables the "strip-mine" scenario: a well-funded company forks OpenPulse, adds proprietary improvements, and offers a competing SaaS without contributing back. This has occurred repeatedly with permissively licensed infrastructure projects (Redis, Elasticsearch, MongoDB all eventually moved to more restrictive licenses after commercialization conflicts).
- The community invests effort in detection algorithm improvements that a proprietary fork can capture without reciprocation
- Does not protect the sustainability of the open-source project
- However, specific utility libraries and client SDKs may be released under MIT to maximize adoption of the API ecosystem

### Alternative 3: Dual-License (AGPL + Commercial) Without Open Data

Release the code under AGPL but keep the outage data proprietary.

**Rejected because:**
- Outage data is the primary output of the platform; keeping it proprietary undermines the democratization mission
- Academic research remains blocked without accessible data
- The data has minimal marginal cost to distribute (aggregated, anonymized) but significant value to the community
- Open data is a key differentiator that proprietary competitors cannot match
- Revenue is generated from API tier services (rate limits, SLA, support), not data scarcity

## References

- OpenPulse Research Document, Section 9.2 (Key Differentiators -- Open Data and Open Source)
- OpenPulse Research Document, Section 8.3 (Revenue Model)
- OpenPulse Research Document, Section 10, Phase 4 (Ecosystem -- Open Data API, Academic Research Access)
- GNU AGPL-3.0 License Text: https://www.gnu.org/licenses/agpl-3.0.en.html
- Creative Commons BY 4.0: https://creativecommons.org/licenses/by/4.0/

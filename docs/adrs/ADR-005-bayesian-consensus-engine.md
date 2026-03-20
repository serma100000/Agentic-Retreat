# ADR-005: Weighted Bayesian Fusion with State Machine for Multi-Signal Consensus

## Status

**Accepted** -- March 2026

## Context

OpenPulse ingests signals from four independent sources -- crowdsourced user reports, active probes, social media NLP analysis, and official status page aggregation -- each processed through a 4-layer detection ensemble (ADR-002). The system must combine these heterogeneous signals into a single, actionable assessment of each monitored service's operational status.

This is a non-trivial fusion problem because:

1. **Signal reliability varies**: Active probes provide objective, verifiable measurements but only cover configured endpoints. Crowdsourced reports are broad but noisy and susceptible to mob effects. Social media signals are informative but require NLP interpretation. Status pages are authoritative but frequently delayed by 10-30 minutes.

2. **Signal independence varies**: Reports and social media signals are partially correlated (the same outage drives both), while probes and status pages are more independent. Naive aggregation that treats all signals as independent overestimates confidence.

3. **False positive cost is high**: Incorrectly declaring a major outage erodes user trust and can trigger unnecessary incident response at organizations consuming the API. False negatives (missed outages) are also costly but somewhat less damaging -- users can still submit reports and the outage will eventually be detected.

4. **State transitions must be stable**: Rapid oscillation between OPERATIONAL and DEGRADED ("flapping") confuses users and triggers spurious notifications. The system must exhibit hysteresis -- requiring sustained signal change before transitioning states.

5. **Temporal dynamics matter**: An outage has a lifecycle (onset, escalation, peak, recovery, resolution) and the consensus engine must model these temporal dynamics rather than treating each moment independently.

6. **Explainability**: When the system declares an outage, operators and API consumers need to understand which signals contributed and with what weight. Black-box fusion is unacceptable for a platform whose credibility depends on detection accuracy.

## Decision

We will implement a **weighted Bayesian fusion engine** combined with a **deterministic state machine** that governs service status transitions.

### Bayesian Signal Fusion

The core fusion formula combines evidence from all signal sources using Bayes' theorem:

```
P(outage | signals) = P(signals | outage) * P(outage) / P(signals)
```

In practice, this is implemented as a log-odds accumulator that processes each signal source's detection output:

**Prior**: The baseline probability of outage for a given service at a given time, derived from historical outage frequency. Services with frequent outages have a higher prior; stable services have a lower prior. Time-of-day and day-of-week adjustments account for maintenance windows and peak usage patterns.

**Likelihood ratios**: Each signal source contributes a likelihood ratio based on its current observation:

| Signal Source | Weight Factor | Likelihood When Positive | Likelihood When Negative |
|--------------|---------------|-------------------------|-------------------------|
| Active Probes (failed) | 1.0 (highest) | 10.0 | 0.1 |
| Crowdsourced Reports (elevated) | 0.7 | 5.0 | 0.3 |
| Social Media NLP (outage detected) | 0.5 | 3.0 | 0.5 |
| Status Page (incident posted) | 0.9 | 8.0 | 0.2 |
| Layer 3 LSTM (anomaly) | 0.6 | 4.0 | 0.4 |
| Layer 4 XGBoost (prediction) | 0.4 | 2.5 | 0.6 |

Weight factors are calibrated using historical data: for each signal source, we measure the precision and recall of its detections against confirmed outages and derive likelihood ratios that reflect empirical accuracy.

**Correlation adjustment**: Signals that share a common cause (e.g., reports and social media both driven by user awareness) have their combined weight discounted by a correlation factor to avoid double-counting evidence. The correlation matrix is estimated from historical co-occurrence data.

**Output**: The posterior probability P(outage | signals) is a continuous confidence score between 0.0 and 1.0, updated in real time as new signals arrive.

### State Machine

The continuous confidence score drives transitions in a deterministic state machine that governs the public-facing service status:

| State | Description | Entry Condition | Exit Condition |
|-------|-------------|-----------------|----------------|
| `OPERATIONAL` | No detected issues | Default; all signals at baseline for 15+ minutes | Any detector exceeds threshold |
| `INVESTIGATING` | Elevated signals, not confirmed | Any single signal source exceeds its threshold | Escalation to DEGRADED, or signals return to baseline for 5+ minutes |
| `DEGRADED` | Confirmed partial outage | 2+ independent signal sources confirm; confidence > 0.7 | Escalation to MAJOR_OUTAGE, or recovery |
| `MAJOR_OUTAGE` | Confirmed widespread outage | 3+ signal sources; confidence > 0.9; geographic spread confirmed | Recovery begins |
| `RECOVERING` | Signals declining from outage | Report rate declining trend for 5+ minutes; probe success rate improving | Full resolution or regression |
| `RESOLVED` | Outage ended | All signals return to baseline for 15+ minutes | New anomaly detected |

**Hysteresis rules**:
- Escalation (OPERATIONAL -> INVESTIGATING -> DEGRADED -> MAJOR_OUTAGE) requires the triggering condition to be sustained for a minimum dwell time (30 seconds for INVESTIGATING, 2 minutes for DEGRADED, 5 minutes for MAJOR_OUTAGE)
- De-escalation (RECOVERING -> RESOLVED) requires 15 minutes of sustained baseline signals
- A brief signal spike that resolves within the dwell time does not trigger a state transition
- Regression from RECOVERING back to DEGRADED/MAJOR_OUTAGE is allowed with a shorter dwell time (30 seconds) to quickly re-escalate if recovery is false

**State transition events**: Every state transition is recorded as an immutable event in the streaming backbone, including:
- Previous state and new state
- Confidence score at transition
- Contributing signal sources and their individual scores
- Geographic scope of the detected issue
- Timestamp with millisecond precision

These events build a complete, auditable timeline of each outage's lifecycle.

### Geographic Fusion

The consensus engine operates at multiple geographic granularities:

1. **Global**: Overall service status aggregating all regions
2. **Continental**: Major geographic regions (North America, Europe, Asia-Pacific, etc.)
3. **Country/State**: Where probe and report density supports it
4. **ISP/ASN**: Network-level outage detection based on ASN clustering of reports and probe paths

A service can be OPERATIONAL globally but DEGRADED in a specific region, enabling precise geographic outage reporting that existing platforms lack.

### Confidence Decay

In the absence of new signals, the confidence score decays toward the prior over time. This ensures that a stale high-confidence score does not persist indefinitely if signal sources stop reporting (e.g., a probe fleet goes offline). The decay half-life is configurable per signal source (default: 5 minutes for probes, 15 minutes for reports, 30 minutes for social media).

## Consequences

### Positive

1. **Principled uncertainty quantification**: Bayesian fusion provides a mathematically grounded framework for combining heterogeneous signals with different reliability characteristics, producing calibrated confidence scores.

2. **Explainable decisions**: Every state transition includes the contributing signals and their weights. API consumers can inspect why a service was marked as degraded and which signals contributed.

3. **Reduced false positives**: Requiring corroboration from multiple independent signals before escalating beyond INVESTIGATING dramatically reduces false positives from single-source noise (viral tweets, report manipulation).

4. **Reduced false negatives**: Multiple signal sources provide redundancy. If social media monitoring is down, probes and reports still drive detection. If a service has few users (low report volume), probes still detect the outage.

5. **Stable status representation**: Hysteresis and dwell-time rules prevent flapping, providing stable status that users and automation can rely on.

6. **Geographic precision**: Multi-level geographic fusion enables distinguishing regional ISP issues from global service outages.

7. **Adaptive calibration**: Likelihood ratios and correlation factors are derived from empirical data and can be recalibrated as the system accumulates more historical outage data.

### Negative

1. **Calibration effort**: Likelihood ratios and correlation factors require careful initial calibration and ongoing recalibration as signal source characteristics change (e.g., a new social media platform gains prominence).

2. **Cold-start for new services**: Services without historical outage data have poorly calibrated priors and likelihood ratios. Default category-level parameters are used until sufficient data accumulates.

3. **Complexity**: The combination of Bayesian fusion, state machine, hysteresis, geographic multi-resolution, and confidence decay creates a complex system that requires thorough testing and monitoring.

4. **Dwell-time latency**: Hysteresis rules add latency to state transitions. A genuine major outage takes a minimum of 30 seconds (INVESTIGATING dwell) + 2 minutes (DEGRADED dwell) + 5 minutes (MAJOR_OUTAGE dwell) = 7.5 minutes to reach MAJOR_OUTAGE status, even with overwhelming evidence. This is a deliberate trade-off favoring stability over speed, and the continuous confidence score is available immediately for consumers who prefer raw signal data.

5. **Parameter sensitivity**: The system's behavior is sensitive to the choice of thresholds, dwell times, likelihood ratios, and decay rates. Systematic sensitivity analysis and A/B testing are required.

## Alternatives Considered

### Alternative 1: Simple Voting (Majority Rules)

Each signal source votes "outage" or "no outage" and the majority wins.

**Rejected because:**
- Treats all signal sources as equally reliable, ignoring the significant differences in precision and recall across probes, reports, social media, and status pages
- Binary voting discards the rich continuous confidence information from each source
- Cannot model partial outages or geographic variation
- No hysteresis mechanism; susceptible to flapping
- No principled framework for handling correlated signals

### Alternative 2: Weighted Average

A weighted average of normalized signal scores, with manually assigned weights.

**Rejected because:**
- While better than simple voting, weighted averaging does not properly handle the multiplicative evidence accumulation that Bayesian inference provides
- A weighted average of 0.3 and 0.7 yields 0.5, suggesting uncertainty. Bayesian fusion of the same evidence (two independent sources both suggesting outage) yields a much higher posterior, correctly reflecting that two agreeing sources provide stronger evidence than either alone.
- No principled method for deriving weights; they must be manually tuned
- Does not naturally incorporate prior probabilities or handle the absence of signals (silence from a source)

### Alternative 3: Neural Fusion Model

A neural network trained end-to-end to classify service status from raw signal features.

**Rejected because:**
- Black box: cannot explain why a particular status was assigned, undermining platform credibility
- Requires large labeled training datasets with all signal types present, which is not available at launch
- Harder to debug when fusion produces unexpected results
- Cannot be incrementally improved by adjusting individual signal weights; the entire model must be retrained
- Bayesian fusion provides comparable accuracy with full explainability and no training data requirement (likelihood ratios can be set from first principles and refined with data)
- However, neural approaches may be explored in future work for capturing non-linear interactions between signals that Bayesian fusion misses

## References

- OpenPulse Research Document, Section 5.3 (Multi-Signal Consensus Engine)
- OpenPulse Research Document, Section 5.2 (Anomaly Detection Engine)
- OpenPulse Research Document, Section 9.2 (Key Differentiators -- Multi-Signal Fusion)

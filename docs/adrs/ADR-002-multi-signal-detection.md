# ADR-002: Multi-Signal Ensemble Detection Approach

## Status

**Accepted** -- March 2026

## Context

The core value proposition of OpenPulse is superior outage detection accuracy compared to existing platforms. Current-generation platforms like Downdetector rely primarily on a single signal source (crowdsourced user reports supplemented by limited social media monitoring), resulting in well-documented problems:

1. **High false positive rates**: A trending social media post or news article about a service can trigger a wave of "me too" reports even when no actual outage exists. Downdetector is frequently criticized for report inflation during high-profile events.

2. **Detection latency bounded by human behavior**: Crowdsourced-only detection depends on users noticing a problem, navigating to a reporting platform, and submitting a report. This introduces minutes of latency, particularly for services with smaller user bases or outages occurring during off-peak hours.

3. **Inability to detect partial degradations**: Threshold-based detection on a single signal misses gradual performance degradations that do not trigger immediate user complaints but eventually escalate into full outages.

4. **No predictive capability**: Reactive-only platforms cannot warn users of impending outages based on precursor signals such as increasing latency, DNS anomalies, or certificate expiry.

5. **Geographic blind spots**: Single-signal platforms struggle to distinguish between regional and global outages without corroborating evidence from independent signal sources.

Academic research strongly supports multi-modal approaches. Schmidl et al. (2022) and Blazquez-Garcia et al. (2021) demonstrate that combining statistical thresholds, deep learning reconstruction error, and ensemble methods yields superior detection accuracy compared to any single approach. The key insight is that different anomaly types (abrupt outages, gradual degradations, intermittent failures) are best captured by different detection methods.

OpenPulse ingests four independent signal streams, each with distinct characteristics:

| Signal Source | Latency | Reliability | Coverage | Noise Level |
|--------------|---------|------------|----------|-------------|
| Crowdsourced Reports | Minutes | Variable (mob effects) | Broad (popular services) | High |
| Active Probes | Seconds | High (objective measurement) | Targeted (configured services) | Low |
| Social Media NLP | Minutes | Moderate (NLP accuracy) | Broad (trending services) | Medium |
| Status Page Aggregation | 10-30 min delayed | Low (providers delay acknowledgment) | Limited (official pages only) | Low |

No single signal source provides the combination of speed, accuracy, coverage, and reliability needed for production-grade outage detection.

## Decision

We will implement a **4-layer ensemble detection approach** that processes signals through increasingly sophisticated models, with a multi-signal consensus engine fusing outputs into a unified confidence score.

### Layer 1: Statistical Threshold Detection (Latency < 10ms)

The baseline detector uses adaptive thresholds computed from sliding-window statistics. For each monitored service, a 7-day rolling baseline of report rates is maintained with hourly granularity and day-of-week seasonality adjustment.

```
anomaly_score = (current_rate - expected_rate) / max(std_dev, min_floor)
```

An anomaly is flagged when the z-score exceeds a configurable threshold (default: 3.0), with separate thresholds for different service tiers and time periods.

**Strengths**: Extremely fast (sub-10ms), no model training required, interpretable.
**Weaknesses**: Susceptible to false positives from viral social media posts, cannot detect gradual degradations.

### Layer 2: CUSUM Change-Point Detection (Latency < 50ms)

A Cumulative Sum (CUSUM) algorithm detects abrupt changes in the report rate distribution. Unlike simple thresholding, CUSUM is sensitive to sustained shifts in the mean rate even when individual data points do not exceed static thresholds.

**Strengths**: Detects gradual degradations that escalate into outages, low computational cost, well-understood statistical properties.
**Weaknesses**: Requires tuning of slack and threshold parameters per service category, slower to detect very abrupt changes than Layer 1.

### Layer 3: LSTM Autoencoder Reconstruction (Latency < 200ms)

A lightweight autoencoder model trained on per-service normal behavior patterns generates reconstruction error signals.

**Architecture**:
- Input: 60-minute sliding window of multivariate features (report rate, probe latency, probe success rate, social mention rate)
- Encoder: 3 LSTM layers with attention, compressing to a 32-dimensional latent space
- Decoder: Mirror architecture reconstructing the input window
- Anomaly signal: Mean squared reconstruction error exceeding the 99th percentile of training-set errors

Models are trained per-service-category (e.g., all social media services share a model) with periodic fine-tuning on service-specific data. Inference runs on ONNX Runtime for cross-platform portability and hardware-agnostic acceleration.

**Strengths**: Captures complex temporal patterns and multivariate correlations that statistical methods miss, automatically adapts to each service's normal behavior profile.
**Weaknesses**: Requires training data (cold-start problem for new services), higher computational cost, less interpretable.

### Layer 4: XGBoost Predictive Detection (Latency < 500ms)

A gradient-boosted decision tree model trained on historical outage precursor features:

- Rate of change of report velocity (acceleration)
- Probe latency trend (increasing latency often precedes full outage)
- Social media mention sentiment shift
- DNS resolution time anomalies
- TLS certificate expiry proximity
- Historical outage patterns for the service (time-of-day, day-of-week recurrence)

This model outputs a probability of outage onset within the next 5, 15, and 60 minutes.

**Strengths**: Enables proactive alerting before outages fully manifest, leverages cross-signal features, interpretable feature importance.
**Weaknesses**: Requires substantial historical training data, prediction accuracy depends on outage patterns being recurrent.

### Ensemble Fusion

Each layer operates independently and publishes detection events to the `detections` Kafka topic with its confidence score, latency, and signal provenance. The Consensus Engine (see ADR-005) fuses these outputs using weighted Bayesian inference.

The layered approach provides progressive refinement:
1. Layer 1 fires within seconds for obvious outages (fast, coarse)
2. Layer 2 confirms sustained anomalies within 30 seconds (moderate, sensitive to shifts)
3. Layer 3 validates against learned normal behavior within 1-2 minutes (precise, multivariate)
4. Layer 4 may predict the outage before Layers 1-3 even trigger (proactive)

### Model Lifecycle

- **Training**: Python (PyTorch) for LSTM autoencoder, scikit-learn/XGBoost for Layer 4. Training runs on GPU instances (spot pricing) on a weekly schedule.
- **Inference**: ONNX Runtime for cross-platform portability. Models are versioned and deployed via model registry with canary rollout.
- **Retraining**: Automated retraining triggered when detection accuracy metrics (precision, recall, F1) drift below thresholds, or on a fixed weekly schedule.
- **Cold start**: New services default to category-level models until sufficient service-specific data accumulates (typically 2-4 weeks).

## Consequences

### Positive

1. **Dramatically reduced false positives**: Multiple independent signals must corroborate before an outage is confirmed. A viral tweet alone does not trigger a MAJOR_OUTAGE state -- it must be confirmed by elevated reports, probe failures, or other signals.

2. **Faster detection**: Statistical thresholds (Layer 1) provide sub-5-second detection for obvious outages, while ML layers catch subtle anomalies that thresholds miss.

3. **Predictive capability**: Layer 4 provides the industry's first predictive outage warnings based on precursor signal analysis, fundamentally differentiating OpenPulse from all competitors.

4. **Graceful degradation of detection**: If the ML inference service is unavailable, Layers 1 and 2 (pure statistical, no ML dependency) continue operating. Detection accuracy degrades gracefully rather than failing completely.

5. **Geographic precision**: Multi-signal correlation enables distinguishing regional ISP issues from global service outages -- probes from unaffected regions return healthy results even when user reports spike in a specific area.

6. **Continuous improvement**: The ensemble approach allows individual layers to be improved, retrained, or replaced independently without affecting the overall system.

### Negative

1. **ML infrastructure overhead**: Training, serving, and monitoring ML models requires GPU infrastructure, model registries, and ML engineering expertise that a simpler system would not need.

2. **Cold-start problem**: New services lack training data for Layers 3 and 4. Category-level models provide a reasonable fallback but are less precise than service-specific models.

3. **Tuning complexity**: Each layer has hyperparameters (thresholds, window sizes, model architectures) that must be tuned per service category. This requires ongoing performance monitoring and adjustment.

4. **Latency budget**: The full ensemble takes up to 500ms for all layers to complete. This is acceptable given that outage detection is measured in seconds, but means the system cannot be used for sub-second alerting.

5. **Training data dependency**: Layers 3 and 4 require labeled historical outage data. Initial model quality depends on the availability and accuracy of this training data.

## Alternatives Considered

### Alternative 1: Threshold-Only Detection

Simple static or adaptive thresholds on report rates, similar to the Downdetector approach.

**Rejected because:**
- High false positive rate from viral social media posts and "me too" reporting behavior
- Cannot detect gradual degradations that do not exceed static thresholds
- No predictive capability
- Cannot leverage multivariate signals (combining report rate with probe latency)
- Represents the status quo that OpenPulse aims to surpass

### Alternative 2: Single ML Model (End-to-End)

A single deep learning model that ingests all raw signals and outputs an outage prediction directly.

**Rejected because:**
- Black box: difficult to explain why an outage was detected or not detected, complicating debugging and trust-building
- Single point of failure: if the model fails, all detection fails (no graceful degradation)
- Harder to iterate: improving one aspect of detection (e.g., social signal processing) requires retraining the entire model
- Requires massive labeled training data across all signal types simultaneously
- Does not provide the progressive refinement that the layered approach enables (fast coarse detection followed by slower precise confirmation)

### Alternative 3: Rule-Based Expert System

A set of hand-crafted rules encoding domain expertise about outage patterns (e.g., "if report rate > 5x baseline AND 2+ probes fail, then DEGRADED").

**Rejected because:**
- Rules become brittle and unmaintainable as the number of services and signal types grows
- Cannot capture complex temporal patterns or multivariate correlations
- Requires constant manual tuning by domain experts
- No learning from historical data; the same mistakes recur
- However, rule-based logic is used within Layer 1 (statistical thresholds) as the fastest and most interpretable first line of detection, combining the best aspects of rules with ML for deeper analysis

## References

- OpenPulse Research Document, Section 5 (Data Pipeline and Detection Algorithms)
- Schmidl, S., Wenig, P., and Papenbrock, T. "Anomaly Detection in Time Series: A Comprehensive Evaluation." VLDB, 2022
- Blazquez-Garcia, A., et al. "A Review on Outlier/Anomaly Detection in Time Series Data." ACM Computing Surveys, 2021
- Zhou, H., et al. "One Fits All: Power General Time Series Analysis by Pretrained LM." NeurIPS, 2023
- "Deep Learning for Time Series Anomaly Detection: A Survey." ACM Computing Surveys, 2024

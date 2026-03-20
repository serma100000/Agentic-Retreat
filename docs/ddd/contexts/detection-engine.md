# Bounded Context: Detection Engine (Core Domain)

## Purpose

The Detection Engine is the core domain of OpenPulse. It consumes signal streams
from all upstream contexts (reports, probes, social mentions, status pages), runs
multi-layer anomaly detection, fuses results via a consensus engine, and manages
outage lifecycle state transitions. This is the primary source of competitive
advantage and where the highest modeling investment is directed.

---

## Aggregate: ServiceOutage

The ServiceOutage aggregate tracks the lifecycle of a detected outage for a single
monitored service. It owns the outage state machine and all associated detection data.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  ServiceOutage                            |
|---------------------------------------------------------------|
|  id: OutageId (UUID)                                          |
|  serviceId: ServiceId                                         |
|  state: OutageState                                           |
|  confidenceScore: ConfidenceScore                             |
|  signals: Map<SignalSource, SignalWeight>                      |
|  detectedAt: Timestamp                                        |
|  lastTransitionAt: Timestamp                                  |
|  resolvedAt: Timestamp | null                                 |
|  timeline: List<StateTransition>                              |
|---------------------------------------------------------------|
|  applySignal(signal) -> void                                  |
|  evaluateTransition() -> StateTransitioned | null             |
|  resolve() -> OutageResolved                                  |
|  getConfidence() -> ConfidenceScore                           |
+---------------------------------------------------------------+
         |                            |
         v                            v
+---------------------+    +------------------------+
| ConsensusState      |    | StateTransition        |
|---------------------|    |------------------------|
| layerScores: Map    |    | fromState: OutageState |
| signalWeights: Map  |    | toState: OutageState   |
| fusedConfidence:    |    | reason: string         |
|   ConfidenceScore   |    | confidence: float      |
| lastEvaluated:      |    | timestamp: Timestamp   |
|   Timestamp         |    +------------------------+
+---------------------+
```

## Aggregate: DetectionPipeline

The DetectionPipeline aggregate manages the configuration and execution of the
four detection layers for a given service or service category.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  DetectionPipeline                        |
|---------------------------------------------------------------|
|  id: PipelineId                                               |
|  serviceCategory: string                                      |
|  layers: List<DetectionLayer>                                 |
|  enabled: bool                                                |
|---------------------------------------------------------------|
|  addLayer(layer) -> void                                      |
|  evaluate(signals) -> List<AnomalyDetected>                   |
|  updateBaseline(window) -> void                               |
+---------------------------------------------------------------+
         |
         v
+----------------------------+
| DetectionLayer             |
|----------------------------|
| type: LayerType            |
| config: LayerConfig        |
| threshold: float           |
| weight: SignalWeight       |
| latencyBudget: Duration    |
+----------------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **ServiceOutage** | Aggregate root. Tracks the full lifecycle of one outage for one service. |
| **ConsensusState** | Maintains the current Bayesian fusion state across all layers and signal sources. |
| **DetectionPipeline** | Aggregate root. Configures which detection layers run for a service category. |
| **DetectionLayer** | One of the four anomaly detection algorithms with its configuration. |
| **AnomalyDetector** | Stateful processor that maintains baselines and produces anomaly scores. |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **ConfidenceScore** | Float 0.0-1.0. Derived from Bayesian fusion of all signal sources. |
| **AnomalyScore** | Float. Per-layer deviation measure; higher means stronger anomaly signal. |
| **OutageState** | Enum representing lifecycle phase (see state machine below). |
| **SignalWeight** | Float 0.0-1.0. Relative importance of a signal source in consensus computation. |
| **LayerType** | Enum: `STATISTICAL`, `CUSUM`, `LSTM_AUTOENCODER`, `XGBOOST_PREDICTIVE`. |

---

## Outage State Machine

```
                          any single detector
                          exceeds threshold
    +-------------+     +------------------->+----------------+
    |             |     |                    |                |
    | OPERATIONAL |-----+                    | INVESTIGATING  |
    |             |<---------+               |                |
    +-------------+          |               +-------+--------+
          ^                  |                       |
          |            all signals                   | 2+ signals confirm
          |            return to                     | confidence > 0.7
          |            baseline 15min                |
          |                  |               +-------v--------+
    +-----+-------+         |               |                |
    |             |         |               |  DEGRADED      |
    | RESOLVED    |---------+               |                |
    |             |                          +-------+--------+
    +-----^-------+                                  |
          |                                          | 3+ signals
          |                                          | confidence > 0.9
          |                                          | geographic spread
          |                                          |
    +-----+-------+                          +-------v--------+
    |             |                          |                |
    | RECOVERING  |<-------------------------| MAJOR_OUTAGE   |
    |             |   report rate declining  |                |
    +-------------+   probes improving       +----------------+
```

### Transition Rules

| From | To | Conditions | Hysteresis |
|------|----|------------|------------|
| OPERATIONAL | INVESTIGATING | Any single detection layer exceeds threshold | None (immediate) |
| INVESTIGATING | OPERATIONAL | All signals below threshold | 5 minutes sustained |
| INVESTIGATING | DEGRADED | 2+ independent signals confirm; confidence > 0.7 | 2 minutes sustained |
| DEGRADED | MAJOR_OUTAGE | 3+ signals; confidence > 0.9; multi-region impact | 3 minutes sustained |
| DEGRADED | RECOVERING | Report rate declining >30%; probe success improving | 5 minutes sustained |
| MAJOR_OUTAGE | RECOVERING | Report rate declining >30%; probe success improving | 5 minutes sustained |
| RECOVERING | RESOLVED | All signals return to baseline | 15 minutes sustained |
| RECOVERING | DEGRADED | Signals re-escalate during recovery | 2 minutes sustained |
| RECOVERING | MAJOR_OUTAGE | Signals re-escalate significantly | 3 minutes sustained |

---

## Detection Layers

### Layer 1: Statistical Threshold (latency < 10ms)

Adaptive thresholds from 7-day rolling baseline with hourly granularity and
day-of-week seasonality. Anomaly score = z-score of current rate vs. expected rate.
Threshold default: 3.0 standard deviations.

### Layer 2: CUSUM Change-Point (latency < 50ms)

Cumulative Sum algorithm detecting sustained shifts in report rate distribution.
Effective for gradual degradations that do not trigger static thresholds.

### Layer 3: LSTM Autoencoder (latency < 200ms)

Reconstruction-based anomaly detection. 60-minute sliding window of multivariate
features (report rate, probe latency, probe success, social mentions). 3-layer
LSTM encoder/decoder with attention. Anomaly = reconstruction error above 99th
percentile. Models trained per service category, inference via ONNX Runtime.

### Layer 4: XGBoost Predictive (latency < 500ms)

Gradient-boosted decision tree predicting outage probability within 5, 15, and
60 minutes. Features: report velocity acceleration, probe latency trends,
sentiment shift, DNS anomalies, TLS expiry proximity, historical patterns.

---

## Domain Events

| Event | Payload | Trigger |
|-------|---------|---------|
| **AnomalyDetected** | serviceId, layerType, anomalyScore, timestamp | A detection layer flags an anomaly |
| **OutageConfirmed** | outageId, serviceId, confidence, state (DEGRADED) | Consensus engine confirms outage |
| **OutageDegraded** | outageId, serviceId, confidence | Escalation to MAJOR_OUTAGE state |
| **OutageResolved** | outageId, serviceId, duration, timeline | All signals return to baseline |
| **StateTransitioned** | outageId, fromState, toState, confidence, reason | Any state machine transition |

---

## Integration Points

| Direction | Context | Mechanism | Topic |
|-----------|---------|-----------|-------|
| **Upstream** | Report Ingestion | Kafka consumer | `reports.validated` |
| **Upstream** | Active Probing | Kafka consumer | `probes.results` |
| **Upstream** | Social Intelligence | Kafka consumer | `social.mentions` |
| **Upstream** | Status Page Aggregation | Kafka consumer | `statuspages.updates` |
| **Downstream** | Notification | Kafka producer | `detections.outages` |
| **Downstream** | API Gateway | Kafka producer / query API | `detections.outages` |
| **Reference** | Service Catalog | Cached lookup | Service metadata |

---

## Invariants

1. A ServiceOutage MUST NOT transition to a lower-severity state without hysteresis.
2. ConfidenceScore MUST be recomputed on every new signal arrival.
3. State transitions MUST be recorded as immutable events in the timeline.
4. Each detection layer MUST complete within its latency budget or be skipped.
5. The consensus engine MUST require 2+ independent signal sources for DEGRADED.
6. The consensus engine MUST require 3+ signal sources for MAJOR_OUTAGE.

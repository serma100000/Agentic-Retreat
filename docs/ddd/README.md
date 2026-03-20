# OpenPulse Domain-Driven Design Documentation

## Overview

This directory contains the Domain-Driven Design (DDD) bounded context documentation
for the OpenPulse outage detection platform. Each document describes a bounded context
with its aggregates, entities, value objects, domain events, and integration points.

## Document Index

| Document | Description |
|----------|-------------|
| [Domain Overview](domain-overview.md) | High-level domain model, context map, and ubiquitous language |
| [Report Ingestion](contexts/report-ingestion.md) | User report intake, validation, dedup, and geo-enrichment |
| [Detection Engine](contexts/detection-engine.md) | Core domain: anomaly detection, consensus, state machine |
| [Active Probing](contexts/active-probing.md) | Distributed probe fleet and health check execution |
| [Social Intelligence](contexts/social-intelligence.md) | Social media NLP pipeline and outage mention analysis |
| [Notification](contexts/notification.md) | Multi-channel alert dispatch and subscription management |
| [Service Catalog](contexts/service-catalog.md) | Monitored service registry and dependency mapping |
| [API Gateway](contexts/api-gateway.md) | REST, GraphQL, WebSocket APIs and authentication |

## Domain Classification

```
+-----------------------------------------------------+
|  CORE DOMAIN                                         |
|  Detection Engine - competitive advantage            |
+-----------------------------------------------------+
|  SUPPORTING DOMAINS                                  |
|  Report Ingestion | Active Probing                   |
|  Social Intelligence | Status Page Aggregation       |
+-----------------------------------------------------+
|  GENERIC DOMAINS                                     |
|  Notification | API Gateway | User Management        |
|  Visualization                                       |
+-----------------------------------------------------+
```

## How to Read These Documents

Each bounded context document follows a consistent structure:

1. **Context Purpose** - what the context is responsible for
2. **Aggregates** - consistency boundaries and root entities
3. **Entities** - objects with identity
4. **Value Objects** - immutable descriptors without identity
5. **Domain Events** - facts that have happened in the domain
6. **Integration Points** - how this context communicates with others
7. **Anti-Corruption Layers** - translation boundaries with external systems

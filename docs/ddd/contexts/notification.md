# Bounded Context: Notification

## Purpose

The Notification context manages user notification preferences and dispatches alerts
across multiple channels when the Detection Engine emits outage events. It handles
channel-specific formatting, delivery tracking, retry logic, and subscription
management. This is a generic domain -- the notification infrastructure is not
unique to outage detection.

---

## Aggregate: NotificationPreference

The NotificationPreference aggregate manages a user's subscription and channel
configuration for outage alerts.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  NotificationPreference                   |
|---------------------------------------------------------------|
|  id: PreferenceId                                             |
|  userId: UserId                                               |
|  subscriptions: List<Subscription>                            |
|  quietHours: TimeRange | null                                 |
|  minimumSeverity: AlertSeverity                               |
|  enabled: bool                                                |
|---------------------------------------------------------------|
|  subscribe(serviceId, channels, severity) -> SubscriptionUpdated |
|  unsubscribe(subscriptionId) -> SubscriptionUpdated           |
|  updateChannels(subscriptionId, channels) -> void             |
|  setQuietHours(range) -> void                                 |
+---------------------------------------------------------------+
         |
         v
+---------------------------+
| Subscription              |
|---------------------------|
| id: SubscriptionId        |
| serviceId: ServiceId      |
| channels: List<Channel>   |
| severity: AlertSeverity   |
| active: bool              |
| createdAt: Timestamp      |
+---------------------------+
```

## Aggregate: NotificationDispatch

The NotificationDispatch aggregate handles the actual delivery of a single
notification across one or more channels with tracking and retry.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  NotificationDispatch                     |
|---------------------------------------------------------------|
|  id: DispatchId                                               |
|  outageId: OutageId                                           |
|  serviceId: ServiceId                                         |
|  severity: AlertSeverity                                      |
|  deliveries: List<ChannelDelivery>                            |
|  createdAt: Timestamp                                         |
|---------------------------------------------------------------|
|  dispatch(preferences) -> List<NotificationQueued>            |
|  markDelivered(channelId) -> NotificationSent                 |
|  markFailed(channelId, reason) -> NotificationFailed          |
|  retry(channelId) -> NotificationQueued                       |
+---------------------------------------------------------------+
         |
         v
+---------------------------+
| ChannelDelivery           |
|---------------------------|
| channelType: ChannelType  |
| channelConfig: ChannelConfig |
| status: DeliveryStatus    |
| attempts: int             |
| lastAttemptAt: Timestamp  |
| deliveredAt: Timestamp|null|
| errorMessage: string|null |
+---------------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **NotificationPreference** | Aggregate root. A user's complete notification configuration. |
| **Subscription** | A user's subscription to alerts for a specific service with channel and severity filters. |
| **NotificationDispatch** | Aggregate root. Tracks delivery of one notification across all target channels. |
| **Channel** | A configured delivery endpoint (email address, webhook URL, Slack channel, etc.). |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **AlertSeverity** | Enum: `INFO`, `WARNING`, `CRITICAL`. Maps to outage states (INVESTIGATING=INFO, DEGRADED=WARNING, MAJOR_OUTAGE=CRITICAL). |
| **DeliveryStatus** | Enum: `QUEUED`, `SENDING`, `DELIVERED`, `FAILED`, `RETRYING`. |
| **ChannelType** | Enum: `EMAIL`, `SMS`, `PUSH`, `WEBHOOK`, `SLACK`, `DISCORD`, `TEAMS`, `PAGERDUTY`. |
| **ChannelConfig** | Channel-specific configuration (email address, webhook URL, Slack workspace/channel, PagerDuty routing key, etc.). |

---

## Domain Events

| Event | Payload | Trigger |
|-------|---------|---------|
| **NotificationQueued** | dispatchId, outageId, channelType, severity | Dispatch created for a matching subscription |
| **NotificationSent** | dispatchId, channelType, deliveredAt | Channel delivery confirmed successful |
| **NotificationFailed** | dispatchId, channelType, errorMessage, attempts | Channel delivery failed after retries exhausted |
| **SubscriptionUpdated** | preferenceId, subscriptionId, action (created/updated/removed) | User modifies their notification preferences |

### Event Flow

```
Detection Engine emits OutageConfirmed / StateTransitioned
        |
        v
  Notification context consumes from Kafka: "detections.outages"
        |
        v
  Query matching subscriptions (service + severity)
        |
        v
  For each matching subscription:
        |
        +---> Check quiet hours ---> Skip if in quiet hours
        |
        +---> For each configured channel:
                    |
                    v
              NotificationQueued
                    |
                    v
              Channel-specific dispatcher
              (email/SMS/webhook/Slack/etc.)
                    |
              +-----+-----+
              |           |
              v           v
        NotificationSent  NotificationFailed
                               |
                               v
                          Retry (up to 3 attempts, exponential backoff)
```

---

## Channel Specifications

| Channel | Transport | Format | Retry Policy |
|---------|-----------|--------|--------------|
| Email | SMTP / SES | HTML + plain text | 3 retries, 1m/5m/15m backoff |
| SMS | Twilio / SNS | Plain text, 160 char | 2 retries, 1m/5m backoff |
| Push | FCM / APNs | JSON payload | 3 retries, 30s/2m/10m backoff |
| Webhook | HTTPS POST | JSON payload + HMAC signature | 5 retries, 10s/30s/1m/5m/15m backoff |
| Slack | Slack API | Block Kit message | 3 retries, 1m/5m/15m backoff |
| Discord | Discord Webhook | Embed message | 3 retries, 1m/5m/15m backoff |
| Teams | Teams Webhook | Adaptive Card | 3 retries, 1m/5m/15m backoff |
| PagerDuty | Events API v2 | PD-CEF format | 5 retries, 10s/30s/1m/5m/15m backoff |

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Upstream** | Detection Engine | Kafka topic `detections.outages` | Outage events triggering notifications |
| **Internal** | User Management | Database query | User preferences and channel configs |
| **External** | Email/SMS/Push providers | Channel-specific APIs | Outbound notifications |
| **External** | Slack/Discord/Teams/PagerDuty | Webhook/API calls | Outbound notifications |

---

## Invariants

1. Notifications MUST respect user quiet hours.
2. Notifications MUST NOT be sent for severity levels below the user's minimum.
3. Duplicate notifications for the same outage + channel MUST be suppressed.
4. Webhook deliveries MUST include an HMAC signature for verification.
5. Failed deliveries MUST be retried with exponential backoff up to the channel limit.
6. PII (email, phone) MUST be encrypted at rest in the notification preferences store.

/**
 * Template engine for rendering notification content from outage events.
 */

import type {
  NotificationPayload,
  NotificationPriorityType,
  NotificationTemplate,
} from './types.js';
import { NotificationPriority } from './types.js';

export class TemplateEngine {
  /**
   * Render an outage notification for a service state change.
   */
  renderOutageNotification(payload: NotificationPayload): NotificationTemplate {
    const subject = `[OpenPulse] ${payload.serviceName} - ${payload.outageState}`;

    const regions = this.formatRegions(payload.affectedRegions);
    const confidence = this.formatConfidence(payload.confidence);
    const time = payload.timestamp.toISOString();

    const body = [
      `Service: ${payload.serviceName} (${payload.serviceSlug})`,
      `Status: ${payload.outageState} (was ${payload.previousState})`,
      `Confidence: ${confidence}`,
      `Affected Regions: ${regions}`,
      `Time: ${time}`,
      '',
      payload.message,
    ].join('\n');

    const stateEmoji = this.stateEmoji(payload.outageState);

    const markdown = [
      `${stateEmoji} **${payload.serviceName}** is now **${payload.outageState}**`,
      '',
      `> Previously: ${payload.previousState}`,
      `> Confidence: ${confidence}`,
      `> Regions: ${regions}`,
      `> Time: ${time}`,
      '',
      payload.message,
    ].join('\n');

    return { subject, body, markdown };
  }

  /**
   * Render a recovery notification after an outage resolves.
   */
  renderRecoveryNotification(payload: NotificationPayload): NotificationTemplate {
    const subject = `[OpenPulse] ${payload.serviceName} - Recovered`;

    const regions = this.formatRegions(payload.affectedRegions);
    const confidence = this.formatConfidence(payload.confidence);
    const time = payload.timestamp.toISOString();

    const body = [
      `Service: ${payload.serviceName} (${payload.serviceSlug}) has recovered.`,
      `Previous State: ${payload.previousState}`,
      `Confidence: ${confidence}`,
      `Affected Regions: ${regions}`,
      `Recovered At: ${time}`,
      '',
      payload.message,
    ].join('\n');

    const markdown = [
      `✅ **${payload.serviceName}** has **recovered**`,
      '',
      `> Previous State: ${payload.previousState}`,
      `> Confidence: ${confidence}`,
      `> Regions: ${regions}`,
      `> Recovered At: ${time}`,
      '',
      payload.message,
    ].join('\n');

    return { subject, body, markdown };
  }

  /**
   * Render a digest summarizing multiple outage events.
   */
  renderDigestNotification(outages: NotificationPayload[]): NotificationTemplate {
    const count = outages.length;
    const subject = `[OpenPulse] Digest: ${count} service${count === 1 ? '' : 's'} affected`;

    const lines: string[] = [
      `OpenPulse Digest: ${count} service${count === 1 ? '' : 's'} affected`,
      '',
    ];

    const mdLines: string[] = [
      `**OpenPulse Digest**: ${count} service${count === 1 ? '' : 's'} affected`,
      '',
    ];

    for (const outage of outages) {
      const confidence = this.formatConfidence(outage.confidence);
      const regions = this.formatRegions(outage.affectedRegions);

      lines.push(
        `- ${outage.serviceName}: ${outage.outageState} (${confidence}) [${regions}]`,
      );
      mdLines.push(
        `- **${outage.serviceName}**: ${outage.outageState} (${confidence}) — ${regions}`,
      );
    }

    return {
      subject,
      body: lines.join('\n'),
      markdown: mdLines.join('\n'),
    };
  }

  /**
   * Format a duration in milliseconds to a human-readable string.
   * Examples: "2h 15m", "45m", "3m", "30s"
   */
  formatDuration(ms: number): string {
    if (ms < 0) {
      ms = 0;
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (parts.length === 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(' ');
  }

  /**
   * Format a confidence score (0-1) as a percentage string.
   */
  formatConfidence(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  /**
   * Format a list of regions, truncating with "and N more" for long lists.
   */
  formatRegions(regions: string[]): string {
    if (regions.length === 0) {
      return 'None';
    }
    if (regions.length <= 3) {
      return regions.join(', ');
    }
    const shown = regions.slice(0, 2);
    const remaining = regions.length - 2;
    return `${shown.join(', ')}, and ${remaining} more`;
  }

  /**
   * Map an outage state string to a notification priority.
   */
  priorityFromState(state: string): NotificationPriorityType {
    switch (state) {
      case 'MAJOR_OUTAGE':
        return NotificationPriority.CRITICAL;
      case 'DEGRADED':
        return NotificationPriority.HIGH;
      case 'INVESTIGATING':
        return NotificationPriority.MEDIUM;
      case 'RECOVERING':
        return NotificationPriority.MEDIUM;
      case 'RESOLVED':
      case 'OPERATIONAL':
      default:
        return NotificationPriority.LOW;
    }
  }

  private stateEmoji(state: string): string {
    switch (state) {
      case 'MAJOR_OUTAGE':
        return '🔴';
      case 'DEGRADED':
        return '🟡';
      case 'INVESTIGATING':
        return '🔍';
      case 'RECOVERING':
        return '🔄';
      case 'RESOLVED':
      case 'OPERATIONAL':
        return '✅';
      default:
        return '⚪';
    }
  }
}

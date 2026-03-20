/**
 * Team dashboard management -- create, update, list dashboards
 * and aggregate service status with SLA compliance.
 */

import { randomBytes } from 'node:crypto';
import type {
  DashboardData,
  DashboardWidget,
  ServiceStatus,
  TeamDashboard,
} from '../types.js';

// ── Types ───────────────────────────────────────────────────────

export interface ServiceStatusProvider {
  getServiceStatus(slug: string): ServiceStatus | null;
}

// ── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(12).toString('hex');
}

// ── Default status provider (in-memory, for dev/test) ───────────

export class InMemoryStatusProvider implements ServiceStatusProvider {
  private statuses = new Map<string, ServiceStatus>();

  setStatus(slug: string, status: ServiceStatus): void {
    this.statuses.set(slug, status);
  }

  getServiceStatus(slug: string): ServiceStatus | null {
    return this.statuses.get(slug) ?? null;
  }
}

// ── TeamDashboardService ────────────────────────────────────────

export class TeamDashboardService {
  private dashboards = new Map<string, TeamDashboard>();
  private readonly statusProvider: ServiceStatusProvider;

  constructor(opts?: { statusProvider?: ServiceStatusProvider }) {
    this.statusProvider =
      opts?.statusProvider ?? new InMemoryStatusProvider();
  }

  // ── Create ────────────────────────────────────────────────

  createDashboard(
    orgId: string,
    name: string,
    services: string[],
  ): TeamDashboard {
    if (!name.trim()) {
      throw new Error('Dashboard name is required');
    }

    const dashboard: TeamDashboard = {
      id: generateId(),
      orgId,
      name: name.trim(),
      services,
      layout: 'grid',
      widgets: this.generateDefaultWidgets(services),
      createdAt: new Date(),
    };

    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  // ── Update ────────────────────────────────────────────────

  updateDashboard(
    dashboardId: string,
    updates: Partial<Pick<TeamDashboard, 'name' | 'services' | 'layout' | 'widgets'>>,
  ): TeamDashboard {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    if (updates.name !== undefined) {
      if (!updates.name.trim()) {
        throw new Error('Dashboard name is required');
      }
      dashboard.name = updates.name.trim();
    }
    if (updates.services !== undefined) {
      dashboard.services = updates.services;
    }
    if (updates.layout !== undefined) {
      dashboard.layout = updates.layout;
    }
    if (updates.widgets !== undefined) {
      dashboard.widgets = updates.widgets;
    }

    return dashboard;
  }

  // ── Get ───────────────────────────────────────────────────

  getDashboard(dashboardId: string): TeamDashboard | null {
    return this.dashboards.get(dashboardId) ?? null;
  }

  // ── List ──────────────────────────────────────────────────

  listDashboards(orgId: string): TeamDashboard[] {
    return [...this.dashboards.values()].filter((d) => d.orgId === orgId);
  }

  // ── Aggregated data ───────────────────────────────────────

  getDashboardData(dashboardId: string): DashboardData {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const services: ServiceStatus[] = [];
    let operational = 0;
    let degraded = 0;
    let outage = 0;

    for (const slug of dashboard.services) {
      const status = this.statusProvider.getServiceStatus(slug);
      if (status) {
        services.push(status);
        switch (status.status) {
          case 'operational':
            operational++;
            break;
          case 'degraded':
            degraded++;
            break;
          case 'partial_outage':
          case 'major_outage':
            outage++;
            break;
        }
      } else {
        // Service not found -- report unknown
        services.push({
          slug,
          status: 'operational',
          confidence: 0,
        });
      }
    }

    return {
      services,
      summary: {
        total: dashboard.services.length,
        operational,
        degraded,
        outage,
      },
    };
  }

  // ── Private ───────────────────────────────────────────────

  private generateDefaultWidgets(services: string[]): DashboardWidget[] {
    const widgets: DashboardWidget[] = [
      {
        id: generateId(),
        type: 'status-grid',
        position: { x: 0, y: 0, w: 12, h: 4 },
      },
    ];

    services.forEach((serviceId, i) => {
      widgets.push({
        id: generateId(),
        type: 'uptime-chart',
        serviceId,
        position: { x: (i % 2) * 6, y: 4 + Math.floor(i / 2) * 4, w: 6, h: 4 },
      });
    });

    return widgets;
  }
}

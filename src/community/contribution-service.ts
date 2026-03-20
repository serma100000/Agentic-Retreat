/**
 * Community contribution service for the OpenPulse platform.
 *
 * Manages the lifecycle of service contributions from submission
 * through review and approval. Generates service definition YAML.
 */

import type {
  ContributionReview,
  ServiceContribution,
  ServiceValidation,
} from './types.js';
import { ContributionStatus, type ContributionStatusType, type ServiceCategoryType } from './types.js';
import { ServiceValidator } from './service-validator.js';

export class ContributionService {
  private readonly contributions = new Map<string, ServiceContribution>();
  private readonly existingSlugs = new Set<string>();
  private readonly validator: ServiceValidator;

  constructor(
    existingSlugs: string[] = [],
    validator?: ServiceValidator,
  ) {
    for (const slug of existingSlugs) {
      this.existingSlugs.add(slug);
    }
    this.validator = validator ?? new ServiceValidator(existingSlugs);
  }

  /**
   * Submit a new service contribution for review.
   */
  async submitService(contribution: Omit<ServiceContribution, 'id' | 'submittedAt' | 'status'>): Promise<ServiceContribution> {
    const validation = await this.validator.runFullValidation({
      ...contribution,
      id: '',
      submittedAt: new Date(),
      status: ContributionStatus.PENDING,
    } as ServiceContribution);

    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Contribution validation failed: ${errorMessages}`);
    }

    if (this.checkDuplicateSlug(contribution.slug)) {
      throw new Error(`Slug "${contribution.slug}" is already in use`);
    }

    const id = this.generateId();
    const entry: ServiceContribution = {
      ...contribution,
      id,
      submittedAt: new Date(),
      status: ContributionStatus.PENDING,
    };

    this.contributions.set(id, entry);
    return entry;
  }

  /**
   * Review a pending contribution (approve or reject).
   */
  reviewContribution(
    id: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
    comment: string = '',
  ): ContributionReview {
    const contribution = this.contributions.get(id);
    if (!contribution) {
      throw new Error(`Contribution "${id}" not found`);
    }

    if (contribution.status !== ContributionStatus.PENDING) {
      throw new Error(
        `Contribution "${id}" has already been reviewed (status: ${contribution.status})`,
      );
    }

    const status: ContributionStatusType =
      decision === 'approved'
        ? ContributionStatus.APPROVED
        : ContributionStatus.REJECTED;

    contribution.status = status;
    contribution.reviewedBy = reviewerId;
    contribution.reviewedAt = new Date();
    contribution.reviewComment = comment;

    if (decision === 'approved') {
      this.existingSlugs.add(contribution.slug);
    }

    const review: ContributionReview = {
      contributionId: id,
      reviewerId,
      decision,
      comment,
      validationResults: { valid: true, errors: [], warnings: [] },
      reviewedAt: contribution.reviewedAt,
    };

    return review;
  }

  /**
   * List all pending contributions.
   */
  listPending(): ServiceContribution[] {
    return [...this.contributions.values()].filter(
      (c) => c.status === ContributionStatus.PENDING,
    );
  }

  /**
   * List all contributions, optionally filtered by status.
   */
  listAll(status?: ContributionStatusType): ServiceContribution[] {
    const all = [...this.contributions.values()];
    if (status) {
      return all.filter((c) => c.status === status);
    }
    return all;
  }

  /**
   * Get a specific contribution by ID.
   */
  getContribution(id: string): ServiceContribution | undefined {
    return this.contributions.get(id);
  }

  /**
   * Check if a slug is already in use.
   */
  checkDuplicateSlug(slug: string): boolean {
    if (this.existingSlugs.has(slug)) {
      return true;
    }
    for (const c of this.contributions.values()) {
      if (c.slug === slug && c.status !== ContributionStatus.REJECTED) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate that a service URL is reachable.
   */
  async validateServiceUrl(url: string): Promise<boolean> {
    return this.validator.validateUrl(url);
  }

  /**
   * Generate service definition YAML from an approved contribution.
   */
  generateServiceYaml(contribution: ServiceContribution): string {
    const lines: string[] = [
      '# OpenPulse Service Definition',
      `# Generated from contribution ${contribution.id}`,
      '',
      `name: "${contribution.name}"`,
      `slug: "${contribution.slug}"`,
      `url: "${contribution.url}"`,
      `category: "${contribution.category}"`,
      `description: "${contribution.description.replace(/"/g, '\\"')}"`,
    ];

    if (contribution.statusPageUrl) {
      lines.push(`status_page_url: "${contribution.statusPageUrl}"`);
    }

    if (contribution.tags && contribution.tags.length > 0) {
      lines.push('tags:');
      for (const tag of contribution.tags) {
        lines.push(`  - "${tag}"`);
      }
    }

    lines.push('');
    lines.push(`submitted_by: "${contribution.submittedBy}"`);
    lines.push(`submitted_at: "${contribution.submittedAt.toISOString()}"`);

    if (contribution.reviewedBy) {
      lines.push(`reviewed_by: "${contribution.reviewedBy}"`);
    }
    if (contribution.reviewedAt) {
      lines.push(`reviewed_at: "${contribution.reviewedAt.toISOString()}"`);
    }

    lines.push('');
    lines.push('monitoring:');
    lines.push('  enabled: true');
    lines.push('  check_interval_ms: 30000');
    lines.push('  timeout_ms: 10000');
    lines.push('');

    return lines.join('\n');
  }

  // ---- Private ----

  private generateId(): string {
    return `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

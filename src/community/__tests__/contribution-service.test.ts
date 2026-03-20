import { describe, expect, it, vi } from 'vitest';
import { ContributionService } from '../contribution-service.js';
import { ServiceValidator } from '../service-validator.js';
import { ContributionStatus, ServiceCategory } from '../types.js';
import type { ServiceContribution } from '../types.js';

function makeContribution(
  overrides: Partial<Omit<ServiceContribution, 'id' | 'submittedAt' | 'status'>> = {},
): Omit<ServiceContribution, 'id' | 'submittedAt' | 'status'> {
  return {
    name: 'GitHub',
    slug: 'github',
    url: 'https://github.com',
    category: ServiceCategory.DEVELOPER_TOOLS,
    description: 'Code hosting platform',
    submittedBy: 'user-1',
    statusPageUrl: 'https://www.githubstatus.com',
    tags: ['git', 'code'],
    ...overrides,
  };
}

/** Create a validator with a mock HTTP check that always returns reachable. */
function makeValidator(
  existingSlugs: string[] = [],
  existingNames: string[] = [],
  existingUrls: string[] = [],
): ServiceValidator {
  return new ServiceValidator(
    existingSlugs,
    existingNames,
    existingUrls,
    async () => ({ reachable: true, statusCode: 200 }),
  );
}

describe('ContributionService', () => {
  describe('submitService', () => {
    it('creates a pending contribution', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(makeContribution());

      expect(contribution.id).toBeDefined();
      expect(contribution.status).toBe(ContributionStatus.PENDING);
      expect(contribution.name).toBe('GitHub');
      expect(contribution.submittedAt).toBeInstanceOf(Date);
    });

    it('rejects contributions with invalid data', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);

      await expect(
        service.submitService(makeContribution({ name: '', slug: '' })),
      ).rejects.toThrow('validation failed');
    });

    it('rejects contributions with invalid category', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);

      await expect(
        service.submitService(
          makeContribution({ category: 'invalid' as any }),
        ),
      ).rejects.toThrow('validation failed');
    });

    it('rejects duplicate slugs', async () => {
      const validator = makeValidator(['github']);
      const service = new ContributionService(['github'], validator);

      await expect(
        service.submitService(makeContribution({ slug: 'github' })),
      ).rejects.toThrow(/already/);
    });
  });

  describe('reviewContribution', () => {
    it('approves a pending contribution', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(makeContribution());

      const review = service.reviewContribution(
        contribution.id,
        'approved',
        'reviewer-1',
        'Looks good!',
      );

      expect(review.decision).toBe('approved');
      expect(review.reviewerId).toBe('reviewer-1');
      expect(review.comment).toBe('Looks good!');

      const updated = service.getContribution(contribution.id);
      expect(updated!.status).toBe(ContributionStatus.APPROVED);
      expect(updated!.reviewedBy).toBe('reviewer-1');
    });

    it('rejects a pending contribution', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(makeContribution());

      const review = service.reviewContribution(
        contribution.id,
        'rejected',
        'reviewer-1',
        'Duplicate service',
      );

      expect(review.decision).toBe('rejected');
      const updated = service.getContribution(contribution.id);
      expect(updated!.status).toBe(ContributionStatus.REJECTED);
    });

    it('throws when contribution not found', () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);

      expect(() =>
        service.reviewContribution('nonexistent', 'approved', 'reviewer-1'),
      ).toThrow('not found');
    });

    it('throws when contribution already reviewed', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(makeContribution());

      service.reviewContribution(contribution.id, 'approved', 'reviewer-1');

      expect(() =>
        service.reviewContribution(contribution.id, 'rejected', 'reviewer-2'),
      ).toThrow('already been reviewed');
    });
  });

  describe('listPending', () => {
    it('returns only pending contributions', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);

      const c1 = await service.submitService(makeContribution({ slug: 'svc-a', name: 'Svc A' }));
      await service.submitService(makeContribution({ slug: 'svc-b', name: 'Svc B' }));

      service.reviewContribution(c1.id, 'approved', 'reviewer-1');

      const pending = service.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.slug).toBe('svc-b');
    });
  });

  describe('checkDuplicateSlug', () => {
    it('detects existing slugs', () => {
      const validator = makeValidator(['github']);
      const service = new ContributionService(['github'], validator);
      expect(service.checkDuplicateSlug('github')).toBe(true);
    });

    it('allows new slugs', () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      expect(service.checkDuplicateSlug('new-service')).toBe(false);
    });

    it('detects pending contribution slugs', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      await service.submitService(makeContribution({ slug: 'test-slug' }));

      expect(service.checkDuplicateSlug('test-slug')).toBe(true);
    });
  });

  describe('generateServiceYaml', () => {
    it('generates valid YAML output', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(makeContribution());

      const yaml = service.generateServiceYaml(contribution);

      expect(yaml).toContain('name: "GitHub"');
      expect(yaml).toContain('slug: "github"');
      expect(yaml).toContain('url: "https://github.com"');
      expect(yaml).toContain('category: "developer_tools"');
      expect(yaml).toContain('status_page_url: "https://www.githubstatus.com"');
      expect(yaml).toContain('tags:');
      expect(yaml).toContain('- "git"');
      expect(yaml).toContain('monitoring:');
      expect(yaml).toContain('enabled: true');
    });

    it('handles contributions without optional fields', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const contribution = await service.submitService(
        makeContribution({ statusPageUrl: undefined, tags: undefined }),
      );

      const yaml = service.generateServiceYaml(contribution);
      expect(yaml).not.toContain('status_page_url');
      expect(yaml).not.toContain('tags:');
    });
  });

  describe('listAll', () => {
    it('returns all contributions', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      await service.submitService(makeContribution({ slug: 'a', name: 'A' }));
      await service.submitService(makeContribution({ slug: 'b', name: 'B' }));

      expect(service.listAll()).toHaveLength(2);
    });

    it('filters by status', async () => {
      const validator = makeValidator();
      const service = new ContributionService([], validator);
      const c1 = await service.submitService(makeContribution({ slug: 'x', name: 'X' }));
      await service.submitService(makeContribution({ slug: 'y', name: 'Y' }));

      service.reviewContribution(c1.id, 'approved', 'rev-1');

      expect(service.listAll(ContributionStatus.APPROVED)).toHaveLength(1);
      expect(service.listAll(ContributionStatus.PENDING)).toHaveLength(1);
    });
  });
});

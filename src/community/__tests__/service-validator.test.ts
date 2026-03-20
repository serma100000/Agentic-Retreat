import { describe, expect, it } from 'vitest';
import { ServiceValidator } from '../service-validator.js';
import { ContributionStatus, ServiceCategory } from '../types.js';
import type { ServiceContribution } from '../types.js';

function makeContribution(
  overrides: Partial<ServiceContribution> = {},
): ServiceContribution {
  return {
    id: 'contrib-1',
    name: 'GitHub',
    slug: 'github',
    url: 'https://github.com',
    category: ServiceCategory.DEVELOPER_TOOLS,
    description: 'Code hosting platform',
    submittedBy: 'user-1',
    submittedAt: new Date(),
    status: ContributionStatus.PENDING,
    statusPageUrl: 'https://www.githubstatus.com',
    ...overrides,
  };
}

function makeValidator(
  slugs: string[] = [],
  names: string[] = [],
  urls: string[] = [],
  reachable = true,
): ServiceValidator {
  return new ServiceValidator(slugs, names, urls, async () => ({
    reachable,
    statusCode: reachable ? 200 : 0,
    error: reachable ? undefined : 'Connection refused',
  }));
}

describe('ServiceValidator', () => {
  describe('validateUrl', () => {
    it('accepts valid reachable URL', async () => {
      const validator = makeValidator([], [], [], true);
      const result = await validator.validateUrl('https://github.com');
      expect(result).toBe(true);
    });

    it('rejects invalid URL format', async () => {
      const validator = makeValidator();
      const result = await validator.validateUrl('not-a-url');
      expect(result).toBe(false);
    });

    it('rejects unreachable URL', async () => {
      const validator = makeValidator([], [], [], false);
      const result = await validator.validateUrl('https://unreachable.example.com');
      expect(result).toBe(false);
    });
  });

  describe('validateStatusPageUrl', () => {
    it('detects Atlassian Statuspage URLs', () => {
      const validator = makeValidator();
      const result = validator.validateStatusPageUrl(
        'https://company.statuspage.io',
      );
      expect(result.valid).toBe(true);
      expect(result.format).toBe('atlassian-statuspage');
    });

    it('detects status subdomain URLs', () => {
      const validator = makeValidator();
      const result = validator.validateStatusPageUrl(
        'https://status.example.com',
      );
      expect(result.valid).toBe(true);
    });

    it('detects status.io URLs', () => {
      const validator = makeValidator();
      const result = validator.validateStatusPageUrl(
        'https://company.status.io',
      );
      expect(result.valid).toBe(true);
      expect(result.format).toBe('status-io');
    });

    it('rejects non-status-page URLs', () => {
      const validator = makeValidator();
      const result = validator.validateStatusPageUrl(
        'https://example.com/about',
      );
      expect(result.valid).toBe(false);
    });

    it('rejects invalid URL format', () => {
      const validator = makeValidator();
      const result = validator.validateStatusPageUrl('not a url');
      expect(result.valid).toBe(false);
    });
  });

  describe('detectDuplicate', () => {
    it('detects duplicate slug', () => {
      const validator = makeValidator(['github']);
      const result = validator.detectDuplicate('New Service', 'github', 'https://new.com');
      expect(result.duplicate).toBe(true);
      expect(result.matches.some((m) => m.includes('slug'))).toBe(true);
    });

    it('detects duplicate name', () => {
      const validator = makeValidator([], ['GitHub']);
      const result = validator.detectDuplicate('GitHub', 'gh-new', 'https://gh.com');
      expect(result.duplicate).toBe(true);
      expect(result.matches.some((m) => m.includes('name'))).toBe(true);
    });

    it('detects duplicate URL', () => {
      const validator = makeValidator([], [], ['https://github.com']);
      const result = validator.detectDuplicate('GH', 'gh', 'https://github.com');
      expect(result.duplicate).toBe(true);
      expect(result.matches.some((m) => m.includes('URL'))).toBe(true);
    });

    it('allows non-duplicate entries', () => {
      const validator = makeValidator(['slack'], ['Slack'], ['https://slack.com']);
      const result = validator.detectDuplicate('GitHub', 'github', 'https://github.com');
      expect(result.duplicate).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('validateCategory', () => {
    it('accepts valid categories', () => {
      const validator = makeValidator();
      expect(validator.validateCategory('cloud')).toBe(true);
      expect(validator.validateCategory('social_media')).toBe(true);
      expect(validator.validateCategory('developer_tools')).toBe(true);
    });

    it('rejects invalid categories', () => {
      const validator = makeValidator();
      expect(validator.validateCategory('invalid')).toBe(false);
      expect(validator.validateCategory('')).toBe(false);
    });
  });

  describe('runFullValidation', () => {
    it('passes valid contribution', async () => {
      const validator = makeValidator([], [], [], true);
      const result = await validator.runFullValidation(makeContribution());

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches missing required fields', async () => {
      const validator = makeValidator();
      const result = await validator.runFullValidation(
        makeContribution({ name: '', slug: '', url: '', description: '' }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('catches invalid slug format', async () => {
      const validator = makeValidator([], [], [], true);
      const result = await validator.runFullValidation(
        makeContribution({ slug: 'INVALID SLUG!' }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_FORMAT')).toBe(true);
    });

    it('catches invalid URL format', async () => {
      const validator = makeValidator();
      const result = await validator.runFullValidation(
        makeContribution({ url: 'not-a-url' }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_URL')).toBe(true);
    });

    it('warns on unreachable URL', async () => {
      const validator = makeValidator([], [], [], false);
      const result = await validator.runFullValidation(makeContribution());

      // URL is valid format but unreachable -> warning, not error
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'UNREACHABLE')).toBe(true);
    });

    it('warns on missing status page URL', async () => {
      const validator = makeValidator([], [], [], true);
      const result = await validator.runFullValidation(
        makeContribution({ statusPageUrl: undefined }),
      );

      expect(result.warnings.some((w) => w.code === 'MISSING_STATUS_PAGE')).toBe(true);
    });

    it('detects duplicates during full validation', async () => {
      const validator = makeValidator(['github'], [], [], true);
      const result = await validator.runFullValidation(makeContribution());

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE')).toBe(true);
    });

    it('catches invalid category', async () => {
      const validator = makeValidator([], [], [], true);
      const result = await validator.runFullValidation(
        makeContribution({ category: 'nonexistent' as any }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CATEGORY')).toBe(true);
    });
  });
});

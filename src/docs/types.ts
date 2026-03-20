/**
 * Types for the OpenPulse documentation site generator (Sprint 23).
 *
 * Covers documentation pages, sections, site structure,
 * OpenAPI spec metadata, and code examples.
 */

export interface DocPage {
  title: string;
  slug: string;
  content: string;
  section: string;
  order: number;
}

export interface DocSection {
  name: string;
  pages: DocPage[];
  order: number;
}

export interface NavItem {
  title: string;
  slug: string;
  section: string;
  order: number;
}

export interface DocSite {
  title: string;
  description: string;
  sections: DocSection[];
  nav: NavItem[];
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: { name: string; url: string; email?: string };
    license?: { name: string; url: string };
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components: {
    schemas: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
  tags?: Array<{ name: string; description: string }>;
}

export interface OpenAPIOperation {
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description: string;
  schema: OpenAPISchema;
}

export interface OpenAPIRequestBody {
  required: boolean;
  content: Record<string, { schema: OpenAPISchema }>;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema }>;
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: string[];
  description?: string;
  $ref?: string;
  nullable?: boolean;
  example?: unknown;
}

export interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
}

export interface CodeExample {
  language: string;
  code: string;
  description: string;
}

export interface SiteConfig {
  title: string;
  description: string;
  baseUrl: string;
  version: string;
}

export interface SearchIndexEntry {
  slug: string;
  title: string;
  section: string;
  content: string;
  keywords: string[];
}

export interface ChangelogEntry {
  type: 'feat' | 'fix' | 'perf' | 'docs' | 'refactor' | 'test' | 'chore';
  scope?: string;
  description: string;
  hash?: string;
  date?: string;
  breaking?: boolean;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

export interface ConventionalCommit {
  hash: string;
  type: string;
  scope?: string;
  description: string;
  body?: string;
  breaking: boolean;
  date: string;
}

/**
 * SDK code generator for the OpenPulse Open Data API (Sprint 19).
 *
 * Generates complete, usable API client libraries in TypeScript, Python,
 * and Go from the API schema definition. Each generated client includes
 * typed responses, error handling, and rate limit awareness.
 */

import type { ApiSchema, ApiEndpoint, ApiTypeDefinition } from './types.js';

/**
 * Generates SDK client code for multiple programming languages.
 */
export class SDKGenerator {
  /**
   * Generate a standalone TypeScript API client.
   */
  generateTypeScript(schema: ApiSchema): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(` * OpenPulse Open Data API Client v${schema.version}`);
    lines.push(' * Auto-generated - do not edit manually.');
    lines.push(' * License: CC-BY-4.0');
    lines.push(' */');
    lines.push('');

    // Type definitions
    for (const typeDef of schema.types) {
      lines.push(this.tsInterface(typeDef));
      lines.push('');
    }

    // Response wrapper
    lines.push('export interface ApiResponse<T> {');
    lines.push('  data: T;');
    lines.push('  total?: number;');
    lines.push('  limit?: number;');
    lines.push('  offset?: number;');
    lines.push('}');
    lines.push('');

    // Error class
    lines.push('export class OpenPulseError extends Error {');
    lines.push('  constructor(');
    lines.push('    message: string,');
    lines.push('    public readonly statusCode: number,');
    lines.push('    public readonly response?: unknown,');
    lines.push('  ) {');
    lines.push("    super(message);");
    lines.push("    this.name = 'OpenPulseError';");
    lines.push('  }');
    lines.push('}');
    lines.push('');

    // Client options
    lines.push('export interface ClientOptions {');
    lines.push('  baseUrl?: string;');
    lines.push('  apiKey?: string;');
    lines.push('  timeout?: number;');
    lines.push('}');
    lines.push('');

    // Client class
    lines.push('export class OpenPulseClient {');
    lines.push('  private readonly baseUrl: string;');
    lines.push('  private readonly apiKey: string | undefined;');
    lines.push('  private readonly timeout: number;');
    lines.push('');
    lines.push('  constructor(options: ClientOptions = {}) {');
    lines.push(`    this.baseUrl = options.baseUrl ?? '${schema.baseUrl}';`);
    lines.push('    this.apiKey = options.apiKey;');
    lines.push('    this.timeout = options.timeout ?? 30000;');
    lines.push('  }');
    lines.push('');

    // Private fetch method
    lines.push('  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {');
    lines.push('    const url = new URL(path, this.baseUrl);');
    lines.push('    if (params) {');
    lines.push('      for (const [key, value] of Object.entries(params)) {');
    lines.push('        if (value !== undefined) url.searchParams.set(key, value);');
    lines.push('      }');
    lines.push('    }');
    lines.push('');
    lines.push('    const headers: Record<string, string> = {');
    lines.push("      'Accept': 'application/json',");
    lines.push('    };');
    lines.push("    if (this.apiKey) headers['X-API-Key'] = this.apiKey;");
    lines.push('');
    lines.push('    const controller = new AbortController();');
    lines.push('    const timeoutId = setTimeout(() => controller.abort(), this.timeout);');
    lines.push('');
    lines.push('    try {');
    lines.push('      const response = await fetch(url.toString(), {');
    lines.push('        headers,');
    lines.push('        signal: controller.signal,');
    lines.push('      });');
    lines.push('');
    lines.push('      if (!response.ok) {');
    lines.push('        const body = await response.text().catch(() => "");');
    lines.push('        throw new OpenPulseError(');
    lines.push('          `API request failed: ${response.status} ${response.statusText}`,');
    lines.push('          response.status,');
    lines.push('          body,');
    lines.push('        );');
    lines.push('      }');
    lines.push('');
    lines.push('      return await response.json() as T;');
    lines.push('    } finally {');
    lines.push('      clearTimeout(timeoutId);');
    lines.push('    }');
    lines.push('  }');
    lines.push('');

    // Endpoint methods
    for (const endpoint of schema.endpoints) {
      lines.push(this.tsMethod(endpoint));
      lines.push('');
    }

    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate a standalone Python API client.
   */
  generatePython(schema: ApiSchema): string {
    const lines: string[] = [];

    lines.push('"""');
    lines.push(`OpenPulse Open Data API Client v${schema.version}`);
    lines.push('Auto-generated - do not edit manually.');
    lines.push('License: CC-BY-4.0');
    lines.push('"""');
    lines.push('');
    lines.push('from __future__ import annotations');
    lines.push('');
    lines.push('import json');
    lines.push('from dataclasses import dataclass, field');
    lines.push('from typing import Any, Optional');
    lines.push('from urllib.request import Request, urlopen');
    lines.push('from urllib.error import HTTPError');
    lines.push('from urllib.parse import urlencode, urljoin');
    lines.push('');
    lines.push('');

    // Type definitions as dataclasses
    for (const typeDef of schema.types) {
      lines.push(this.pyDataclass(typeDef));
      lines.push('');
      lines.push('');
    }

    // Error class
    lines.push('class OpenPulseError(Exception):');
    lines.push('    """API error with status code and response body."""');
    lines.push('');
    lines.push('    def __init__(self, message: str, status_code: int, response: Any = None):');
    lines.push('        super().__init__(message)');
    lines.push('        self.status_code = status_code');
    lines.push('        self.response = response');
    lines.push('');
    lines.push('');

    // Client class
    lines.push('class OpenPulseClient:');
    lines.push('    """Client for the OpenPulse Open Data API."""');
    lines.push('');
    lines.push('    def __init__(');
    lines.push('        self,');
    lines.push(`        base_url: str = "${schema.baseUrl}",`);
    lines.push('        api_key: Optional[str] = None,');
    lines.push('        timeout: int = 30,');
    lines.push('    ):');
    lines.push('        self.base_url = base_url.rstrip("/")');
    lines.push('        self.api_key = api_key');
    lines.push('        self.timeout = timeout');
    lines.push('');

    // Private request method
    lines.push('    def _request(self, path: str, params: Optional[dict[str, str]] = None) -> Any:');
    lines.push('        """Make an HTTP GET request to the API."""');
    lines.push('        url = f"{self.base_url}{path}"');
    lines.push('        if params:');
    lines.push('            filtered = {k: v for k, v in params.items() if v is not None}');
    lines.push('            if filtered:');
    lines.push('                url = f"{url}?{urlencode(filtered)}"');
    lines.push('');
    lines.push('        headers = {"Accept": "application/json"}');
    lines.push('        if self.api_key:');
    lines.push('            headers["X-API-Key"] = self.api_key');
    lines.push('');
    lines.push('        req = Request(url, headers=headers)');
    lines.push('        try:');
    lines.push('            with urlopen(req, timeout=self.timeout) as resp:');
    lines.push('                return json.loads(resp.read().decode("utf-8"))');
    lines.push('        except HTTPError as e:');
    lines.push('            body = e.read().decode("utf-8") if e.fp else ""');
    lines.push('            raise OpenPulseError(');
    lines.push('                f"API request failed: {e.code} {e.reason}",');
    lines.push('                e.code,');
    lines.push('                body,');
    lines.push('            ) from e');
    lines.push('');

    // Endpoint methods
    for (const endpoint of schema.endpoints) {
      lines.push(this.pyMethod(endpoint));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate a standalone Go API client.
   */
  generateGo(schema: ApiSchema): string {
    const lines: string[] = [];

    lines.push(`// OpenPulse Open Data API Client v${schema.version}`);
    lines.push('// Auto-generated - do not edit manually.');
    lines.push('// License: CC-BY-4.0');
    lines.push('');
    lines.push('package openpulse');
    lines.push('');
    lines.push('import (');
    lines.push('\t"encoding/json"');
    lines.push('\t"fmt"');
    lines.push('\t"io"');
    lines.push('\t"net/http"');
    lines.push('\t"net/url"');
    lines.push('\t"time"');
    lines.push(')');
    lines.push('');

    // Type definitions as structs
    for (const typeDef of schema.types) {
      lines.push(this.goStruct(typeDef));
      lines.push('');
    }

    // Error type
    lines.push('// OpenPulseError represents an API error response.');
    lines.push('type OpenPulseError struct {');
    lines.push('\tStatusCode int');
    lines.push('\tMessage    string');
    lines.push('\tBody       string');
    lines.push('}');
    lines.push('');
    lines.push('func (e *OpenPulseError) Error() string {');
    lines.push('\treturn fmt.Sprintf("OpenPulse API error %d: %s", e.StatusCode, e.Message)');
    lines.push('}');
    lines.push('');

    // Client struct
    lines.push('// Client is the OpenPulse Open Data API client.');
    lines.push('type Client struct {');
    lines.push('\tBaseURL    string');
    lines.push('\tAPIKey     string');
    lines.push('\tHTTPClient *http.Client');
    lines.push('}');
    lines.push('');

    // Constructor
    lines.push('// NewClient creates a new OpenPulse API client.');
    lines.push('func NewClient(options ...func(*Client)) *Client {');
    lines.push('\tc := &Client{');
    lines.push(`\t\tBaseURL: "${schema.baseUrl}",`);
    lines.push('\t\tHTTPClient: &http.Client{');
    lines.push('\t\t\tTimeout: 30 * time.Second,');
    lines.push('\t\t},');
    lines.push('\t}');
    lines.push('\tfor _, opt := range options {');
    lines.push('\t\topt(c)');
    lines.push('\t}');
    lines.push('\treturn c');
    lines.push('}');
    lines.push('');

    // Option functions
    lines.push('// WithBaseURL sets the API base URL.');
    lines.push('func WithBaseURL(url string) func(*Client) {');
    lines.push('\treturn func(c *Client) { c.BaseURL = url }');
    lines.push('}');
    lines.push('');
    lines.push('// WithAPIKey sets the API key for authentication.');
    lines.push('func WithAPIKey(key string) func(*Client) {');
    lines.push('\treturn func(c *Client) { c.APIKey = key }');
    lines.push('}');
    lines.push('');

    // Private request method
    lines.push('func (c *Client) doRequest(path string, params url.Values, result interface{}) error {');
    lines.push('\tu, err := url.Parse(c.BaseURL + path)');
    lines.push('\tif err != nil {');
    lines.push('\t\treturn fmt.Errorf("invalid URL: %w", err)');
    lines.push('\t}');
    lines.push('\tif params != nil {');
    lines.push('\t\tu.RawQuery = params.Encode()');
    lines.push('\t}');
    lines.push('');
    lines.push('\treq, err := http.NewRequest("GET", u.String(), nil)');
    lines.push('\tif err != nil {');
    lines.push('\t\treturn fmt.Errorf("creating request: %w", err)');
    lines.push('\t}');
    lines.push('\treq.Header.Set("Accept", "application/json")');
    lines.push('\tif c.APIKey != "" {');
    lines.push('\t\treq.Header.Set("X-API-Key", c.APIKey)');
    lines.push('\t}');
    lines.push('');
    lines.push('\tresp, err := c.HTTPClient.Do(req)');
    lines.push('\tif err != nil {');
    lines.push('\t\treturn fmt.Errorf("executing request: %w", err)');
    lines.push('\t}');
    lines.push('\tdefer resp.Body.Close()');
    lines.push('');
    lines.push('\tbody, err := io.ReadAll(resp.Body)');
    lines.push('\tif err != nil {');
    lines.push('\t\treturn fmt.Errorf("reading response: %w", err)');
    lines.push('\t}');
    lines.push('');
    lines.push('\tif resp.StatusCode >= 400 {');
    lines.push('\t\treturn &OpenPulseError{');
    lines.push('\t\t\tStatusCode: resp.StatusCode,');
    lines.push('\t\t\tMessage:    resp.Status,');
    lines.push('\t\t\tBody:       string(body),');
    lines.push('\t\t}');
    lines.push('\t}');
    lines.push('');
    lines.push('\tif result != nil {');
    lines.push('\t\tif err := json.Unmarshal(body, result); err != nil {');
    lines.push('\t\t\treturn fmt.Errorf("decoding response: %w", err)');
    lines.push('\t\t}');
    lines.push('\t}');
    lines.push('\treturn nil');
    lines.push('}');
    lines.push('');

    // Endpoint methods
    for (const endpoint of schema.endpoints) {
      lines.push(this.goMethod(endpoint));
      lines.push('');
    }

    return lines.join('\n');
  }

  // --- TypeScript helpers ---

  private tsInterface(typeDef: ApiTypeDefinition): string {
    const lines: string[] = [];
    lines.push(`export interface ${typeDef.name} {`);
    for (const f of typeDef.fields) {
      const opt = f.optional ? '?' : '';
      lines.push(`  /** ${f.description} */`);
      lines.push(`  ${f.name}${opt}: ${this.tsType(f.type)};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  private tsType(apiType: string): string {
    const map: Record<string, string> = {
      string: 'string',
      number: 'number',
      integer: 'number',
      boolean: 'boolean',
      timestamp: 'string',
      'string[]': 'string[]',
      'Record<string,number>': 'Record<string, number>',
    };
    return map[apiType] ?? apiType;
  }

  private tsMethod(endpoint: ApiEndpoint): string {
    const lines: string[] = [];
    const methodName = this.endpointToMethodName(endpoint);
    const params = this.tsMethodParams(endpoint);
    const paramsType = params.length > 0 ? `params${endpoint.queryParams.every(p => !p.required) ? '?' : ''}: { ${params.join('; ')} }` : '';

    lines.push(`  /** ${endpoint.description} */`);
    lines.push(`  async ${methodName}(${paramsType}): Promise<${endpoint.responseType}> {`);

    // Build path with substitutions
    let pathExpr = `'${endpoint.path}'`;
    for (const p of endpoint.pathParams) {
      pathExpr = pathExpr.replace(`:${p.name}`, `\${params.${p.name}}`);
      if (pathExpr.includes('${')) {
        pathExpr = '`' + pathExpr.slice(1, -1) + '`';
      }
    }

    // Build query params
    if (endpoint.queryParams.length > 0) {
      const queryEntries = endpoint.queryParams
        .map(p => `${p.name}: params?.${p.name}?.toString()`)
        .join(', ');
      lines.push(`    const queryParams: Record<string, string> = {};`);
      for (const p of endpoint.queryParams) {
        lines.push(`    if (params?.${p.name} !== undefined) queryParams['${p.name}'] = String(params.${p.name});`);
      }
      lines.push(`    return this.request<${endpoint.responseType}>(${pathExpr}, queryParams);`);
    } else {
      lines.push(`    return this.request<${endpoint.responseType}>(${pathExpr});`);
    }

    lines.push('  }');
    return lines.join('\n');
  }

  private tsMethodParams(endpoint: ApiEndpoint): string[] {
    const params: string[] = [];
    for (const p of [...endpoint.pathParams, ...endpoint.queryParams]) {
      const opt = p.required ? '' : '?';
      params.push(`${p.name}${opt}: ${this.tsType(p.type)}`);
    }
    return params;
  }

  // --- Python helpers ---

  private pyDataclass(typeDef: ApiTypeDefinition): string {
    const lines: string[] = [];
    lines.push('@dataclass');
    lines.push(`class ${typeDef.name}:`);
    lines.push(`    """${typeDef.name} data model."""`);
    lines.push('');

    for (const f of typeDef.fields) {
      const pyType = this.pyType(f.type);
      if (f.optional) {
        lines.push(`    ${this.toSnakeCase(f.name)}: Optional[${pyType}] = None  # ${f.description}`);
      } else {
        lines.push(`    ${this.toSnakeCase(f.name)}: ${pyType} = ${this.pyDefault(f.type)}  # ${f.description}`);
      }
    }

    // from_dict class method
    lines.push('');
    lines.push('    @classmethod');
    lines.push(`    def from_dict(cls, data: dict[str, Any]) -> "${typeDef.name}":`);
    lines.push(`        """Create from API response dictionary."""`);
    lines.push('        return cls(');
    for (const f of typeDef.fields) {
      const snake = this.toSnakeCase(f.name);
      lines.push(`            ${snake}=data.get("${f.name}"),`);
    }
    lines.push('        )');

    return lines.join('\n');
  }

  private pyType(apiType: string): string {
    const map: Record<string, string> = {
      string: 'str',
      number: 'float',
      integer: 'int',
      boolean: 'bool',
      timestamp: 'str',
      'string[]': 'list[str]',
      'Record<string,number>': 'dict[str, int]',
    };
    return map[apiType] ?? 'Any';
  }

  private pyDefault(apiType: string): string {
    const map: Record<string, string> = {
      string: '""',
      number: '0.0',
      integer: '0',
      boolean: 'False',
      timestamp: '""',
      'string[]': 'field(default_factory=list)',
      'Record<string,number>': 'field(default_factory=dict)',
    };
    return map[apiType] ?? 'None';
  }

  private pyMethod(endpoint: ApiEndpoint): string {
    const lines: string[] = [];
    const methodName = this.toSnakeCase(this.endpointToMethodName(endpoint));

    const allParams = [...endpoint.pathParams, ...endpoint.queryParams];
    const paramDefs = allParams.map(p => {
      const pyType = this.pyType(p.type);
      return p.required
        ? `${this.toSnakeCase(p.name)}: ${pyType}`
        : `${this.toSnakeCase(p.name)}: Optional[${pyType}] = None`;
    });

    const sig = paramDefs.length > 0
      ? `    def ${methodName}(self, ${paramDefs.join(', ')}) -> Any:`
      : `    def ${methodName}(self) -> Any:`;

    lines.push(sig);
    lines.push(`        """${endpoint.description}"""`);

    // Build path
    let path = endpoint.path;
    for (const p of endpoint.pathParams) {
      path = path.replace(`:${p.name}`, `{${this.toSnakeCase(p.name)}}`);
    }
    if (endpoint.pathParams.length > 0) {
      lines.push(`        path = f"${path}"`);
    } else {
      lines.push(`        path = "${path}"`);
    }

    // Build params dict
    if (endpoint.queryParams.length > 0) {
      lines.push('        params = {');
      for (const p of endpoint.queryParams) {
        const snake = this.toSnakeCase(p.name);
        lines.push(`            "${p.name}": str(${snake}) if ${snake} is not None else None,`);
      }
      lines.push('        }');
      lines.push('        return self._request(path, params)');
    } else {
      lines.push('        return self._request(path)');
    }

    return lines.join('\n');
  }

  // --- Go helpers ---

  private goStruct(typeDef: ApiTypeDefinition): string {
    const lines: string[] = [];
    lines.push(`// ${typeDef.name} represents the ${typeDef.name} data model.`);
    lines.push(`type ${typeDef.name} struct {`);
    for (const f of typeDef.fields) {
      const goType = this.goType(f.type, f.optional);
      const jsonTag = `\`json:"${f.name},omitempty"\``;
      const exportedName = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      lines.push(`\t${exportedName} ${goType} ${jsonTag} // ${f.description}`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  private goType(apiType: string, optional: boolean): string {
    const base: Record<string, string> = {
      string: 'string',
      number: 'float64',
      integer: 'int',
      boolean: 'bool',
      timestamp: 'string',
      'string[]': '[]string',
      'Record<string,number>': 'map[string]int',
    };
    const resolved = base[apiType] ?? 'interface{}';
    if (optional && !resolved.startsWith('[]') && !resolved.startsWith('map')) {
      return `*${resolved}`;
    }
    return resolved;
  }

  private goMethod(endpoint: ApiEndpoint): string {
    const lines: string[] = [];
    const methodName = this.endpointToMethodName(endpoint);
    const capitalName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

    const goParams: string[] = [];
    for (const p of endpoint.pathParams) {
      goParams.push(`${p.name} string`);
    }
    for (const p of endpoint.queryParams) {
      const goType = p.required ? this.goType(p.type, false) : `*${this.goType(p.type, false)}`;
      goParams.push(`${p.name} ${goType}`);
    }

    const sig = goParams.length > 0
      ? `func (c *Client) ${capitalName}(${goParams.join(', ')}) (map[string]interface{}, error)`
      : `func (c *Client) ${capitalName}() (map[string]interface{}, error)`;

    lines.push(`// ${capitalName} ${endpoint.description.charAt(0).toLowerCase()}${endpoint.description.slice(1)}.`);
    lines.push(`${sig} {`);

    // Build path
    let path = endpoint.path;
    for (const p of endpoint.pathParams) {
      path = path.replace(`:${p.name}`, `" + ${p.name} + "`);
    }
    if (endpoint.pathParams.length > 0) {
      lines.push(`\tpath := "${path}"`);
    } else {
      lines.push(`\tpath := "${path}"`);
    }

    // Build query params
    if (endpoint.queryParams.length > 0) {
      lines.push('\tparams := url.Values{}');
      for (const p of endpoint.queryParams) {
        if (p.required) {
          lines.push(`\tparams.Set("${p.name}", fmt.Sprintf("%v", ${p.name}))`);
        } else {
          lines.push(`\tif ${p.name} != nil {`);
          lines.push(`\t\tparams.Set("${p.name}", fmt.Sprintf("%v", *${p.name}))`);
          lines.push('\t}');
        }
      }
    }

    lines.push('\tvar result map[string]interface{}');
    if (endpoint.queryParams.length > 0) {
      lines.push('\terr := c.doRequest(path, params, &result)');
    } else {
      lines.push('\terr := c.doRequest(path, nil, &result)');
    }
    lines.push('\treturn result, err');
    lines.push('}');

    return lines.join('\n');
  }

  // --- Shared helpers ---

  private endpointToMethodName(endpoint: ApiEndpoint): string {
    // Convert path like /api/v1/open/outages to getOutages
    const parts = endpoint.path
      .replace(/\/api\/v\d+\/open\//, '')
      .replace(/\/:[^/]+/g, '')
      .split('/')
      .filter(Boolean);

    const name = parts
      .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
      .join('');

    return `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

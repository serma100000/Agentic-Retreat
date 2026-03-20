#!/usr/bin/env node
/**
 * Script to generate OpenAPI specification and write to docs/api/openapi.json.
 *
 * Usage: npx tsx scripts/generate-api-docs.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OpenAPIGenerator } from '../src/docs/openapi-generator.js';

function main(): void {
  const projectRoot = dirname(dirname(new URL(import.meta.url).pathname));
  const outputDir = join(projectRoot, 'docs', 'api');
  const jsonPath = join(outputDir, 'openapi.json');
  const yamlPath = join(outputDir, 'openapi.yaml');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  const generator = new OpenAPIGenerator();
  const spec = generator.generate();

  const json = generator.toJSON();
  writeFileSync(jsonPath, json, 'utf-8');
  console.log(`Written OpenAPI JSON: ${jsonPath}`);

  const yaml = generator.toYAML();
  writeFileSync(yamlPath, yaml, 'utf-8');
  console.log(`Written OpenAPI YAML: ${yamlPath}`);

  const pathCount = Object.keys(spec.paths).length;
  const schemaCount = Object.keys(spec.components.schemas).length;
  const tagCount = spec.tags?.length ?? 0;

  console.log(`\nSpec summary:`);
  console.log(`  OpenAPI version: ${spec.openapi}`);
  console.log(`  API title: ${spec.info.title}`);
  console.log(`  API version: ${spec.info.version}`);
  console.log(`  Paths: ${pathCount}`);
  console.log(`  Schemas: ${schemaCount}`);
  console.log(`  Tags: ${tagCount}`);

  let operationCount = 0;
  for (const methods of Object.values(spec.paths)) {
    operationCount += Object.keys(methods!).length;
  }
  console.log(`  Operations: ${operationCount}`);
}

main();

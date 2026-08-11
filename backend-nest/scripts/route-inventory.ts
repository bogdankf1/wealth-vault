/**
 * Route-inventory diff: every route Nest registers, against every route FastAPI publishes.
 *
 * This exists because slice 2 shipped two modules that were each missing an endpoint
 * (`POST /process-due-payments` on subscriptions and installments) and every test passed — nothing
 * fails when a route simply is not there. Only a comparison against FastAPI's own OpenAPI document
 * catches that class of omission.
 *
 *   npm run routes                 # all modules
 *   npm run routes -- taxes debts  # only paths containing one of these words
 *
 * FastAPI must be running on :8000. Modules FastAPI serves but Nest has not ported yet are listed
 * separately and are not failures.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const PREFIX = '/api/v1';

interface RouteSet {
  nest: Set<string>;
  fastapi: Set<string>;
}

async function nestRoutes(): Promise<Set<string>> {
  const app = await NestFactory.create(AppModule, { logger: false });
  // configureApp sets the global /api/v1 prefix; without it every path here would be relative.
  configureApp(app);
  await app.init();
  const server = app.getHttpAdapter().getInstance() as {
    router: {
      stack: { route?: { path: string; methods: Record<string, boolean> } }[];
    };
  };

  const routes = new Set<string>();
  for (const layer of server.router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      // Nest prints ':taxId'; FastAPI prints '{tax_id}'. Normalise both to '{}' — this diff is
      // about which routes exist, not what the placeholders are called.
      const path = layer.route.path.replace(/:[A-Za-z0-9_]+/g, '{}');
      routes.add(`${method.toUpperCase()} ${path}`);
    }
  }
  await app.close();
  return routes;
}

async function fastapiRoutes(): Promise<Set<string>> {
  const response = await fetch(`${FASTAPI}/openapi.json`);
  if (!response.ok) {
    throw new Error(`FastAPI returned ${response.status} for /openapi.json`);
  }
  const document = (await response.json()) as {
    paths: Record<string, Record<string, unknown>>;
  };

  const routes = new Set<string>();
  for (const [path, methods] of Object.entries(document.paths)) {
    if (!path.startsWith(PREFIX)) continue;
    for (const method of Object.keys(methods)) {
      routes.add(`${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`);
    }
  }
  return routes;
}

function report({ nest, fastapi }: RouteSet, filters: string[]): number {
  const keep = (route: string): boolean =>
    filters.length === 0 || filters.some((f) => route.includes(f));

  const missing = [...fastapi].filter((r) => keep(r) && !nest.has(r)).sort();
  const extra = [...nest].filter((r) => keep(r) && !fastapi.has(r)).sort();
  const matched = [...nest].filter((r) => keep(r) && fastapi.has(r)).length;

  console.log(`matched: ${matched}`);

  if (missing.length > 0) {
    console.log(`\nIn FastAPI, NOT in Nest (${missing.length}):`);
    for (const route of missing) console.log(`  ${route}`);
  }
  if (extra.length > 0) {
    console.log(`\nIn Nest, NOT in FastAPI (${extra.length}):`);
    for (const route of extra) console.log(`  ${route}`);
  }
  if (missing.length === 0 && extra.length === 0) {
    console.log('\nInventories match exactly.');
  }
  // Only a missing route is a failure: unported modules are expected, and they show up as
  // "missing" only when the caller filters to a module that is supposed to be done.
  return missing.length > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const filters = process.argv.slice(2);
  const [nest, fastapi] = await Promise.all([nestRoutes(), fastapiRoutes()]);
  process.exitCode = report({ nest, fastapi }, filters);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

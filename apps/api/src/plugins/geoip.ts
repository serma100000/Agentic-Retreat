/**
 * Fastify plugin for MaxMind GeoIP2 lookup.
 * Falls back gracefully if the database file is not available.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export interface GeoLookupResult {
  readonly country: string | null;
  readonly region: string | null;
  readonly city: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

type LookupFn = (ip: string) => GeoLookupResult;

declare module 'fastify' {
  interface FastifyInstance {
    geoip: LookupFn;
  }
}

const EMPTY_RESULT: GeoLookupResult = {
  country: null,
  region: null,
  city: null,
  latitude: null,
  longitude: null,
};

function noopLookup(_ip: string): GeoLookupResult {
  return EMPTY_RESULT;
}

async function geoipPlugin(fastify: FastifyInstance): Promise<void> {
  if (!config.geoipDbPath) {
    fastify.log.warn('GeoIP: GEOIP_DB_PATH not set, geo-enrichment disabled');
    fastify.decorate('geoip', noopLookup);
    return;
  }

  try {
    const { Reader } = await import('@maxmind/geoip2-node');
    const reader = await Reader.open(config.geoipDbPath);

    const lookup: LookupFn = (ip: string): GeoLookupResult => {
      try {
        const response = reader.city(ip);
        return {
          country: response.country?.isoCode ?? null,
          region: response.subdivisions?.[0]?.isoCode ?? null,
          city: response.city?.names?.en ?? null,
          latitude: response.location?.latitude ?? null,
          longitude: response.location?.longitude ?? null,
        };
      } catch {
        return EMPTY_RESULT;
      }
    };

    fastify.decorate('geoip', lookup);
    fastify.log.info('GeoIP: database loaded successfully');
  } catch (err) {
    fastify.log.warn({ err }, 'GeoIP: failed to load database, geo-enrichment disabled');
    fastify.decorate('geoip', noopLookup);
  }
}

export default fp(geoipPlugin, {
  name: 'geoip',
});

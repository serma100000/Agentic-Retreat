/**
 * Device fingerprinting middleware.
 * Generates a MurmurHash3 from User-Agent + Accept-Language + X-Device-Info header.
 * Returns a hex hash string for dedup and tracking.
 */

import murmur from 'murmurhash3js-revisited';

export function generateDeviceFingerprint(
  userAgent: string | undefined,
  acceptLanguage: string | undefined,
  deviceInfo: string | undefined,
): string {
  const raw = [
    userAgent ?? 'unknown-ua',
    acceptLanguage ?? 'unknown-lang',
    deviceInfo ?? 'unknown-device',
  ].join('|');

  const hash = murmur.x86.hash128(raw);
  return hash;
}

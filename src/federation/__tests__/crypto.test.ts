import { describe, expect, it } from 'vitest';
import { FederationCrypto } from '../crypto.js';

describe('FederationCrypto', () => {
  const crypto = new FederationCrypto();

  describe('generateKeyPair', () => {
    it('generates a valid Ed25519 key pair', () => {
      const keys = crypto.generateKeyPair();

      expect(keys.publicKey).toBeTruthy();
      expect(keys.privateKey).toBeTruthy();
      expect(typeof keys.publicKey).toBe('string');
      expect(typeof keys.privateKey).toBe('string');
      // Base64 encoded DER keys should be non-trivial length
      expect(keys.publicKey.length).toBeGreaterThan(20);
      expect(keys.privateKey.length).toBeGreaterThan(20);
    });

    it('generates unique key pairs each time', () => {
      const keys1 = crypto.generateKeyPair();
      const keys2 = crypto.generateKeyPair();

      expect(keys1.publicKey).not.toBe(keys2.publicKey);
      expect(keys1.privateKey).not.toBe(keys2.privateKey);
    });
  });

  describe('sign and verify', () => {
    it('roundtrips correctly', () => {
      const keys = crypto.generateKeyPair();
      const data = 'Hello, federation!';

      const signature = crypto.sign(data, keys.privateKey);
      const isValid = crypto.verify(data, signature, keys.publicKey);

      expect(isValid).toBe(true);
    });

    it('verifies signatures on JSON payloads', () => {
      const keys = crypto.generateKeyPair();
      const data = JSON.stringify({ outageId: '123', region: 'us-east-1', severity: 'critical' });

      const signature = crypto.sign(data, keys.privateKey);
      expect(crypto.verify(data, signature, keys.publicKey)).toBe(true);
    });

    it('rejects an invalid signature', () => {
      const keys = crypto.generateKeyPair();
      const data = 'Important data';

      const isValid = crypto.verify(data, 'not-a-real-signature', keys.publicKey);
      expect(isValid).toBe(false);
    });

    it('rejects a signature from a different key', () => {
      const keys1 = crypto.generateKeyPair();
      const keys2 = crypto.generateKeyPair();
      const data = 'Signed by keys1';

      const signature = crypto.sign(data, keys1.privateKey);
      const isValid = crypto.verify(data, signature, keys2.publicKey);

      expect(isValid).toBe(false);
    });

    it('rejects a signature on tampered data', () => {
      const keys = crypto.generateKeyPair();
      const originalData = 'Original data';
      const tamperedData = 'Tampered data';

      const signature = crypto.sign(originalData, keys.privateKey);
      const isValid = crypto.verify(tamperedData, signature, keys.publicKey);

      expect(isValid).toBe(false);
    });
  });

  describe('encrypt and decrypt', () => {
    it('roundtrips correctly', () => {
      const receiverKeys = crypto.generateKeyPair();

      const plaintext = 'Secret outage data for federation sync';
      const encrypted = crypto.encryptForPeer(plaintext, receiverKeys.encryptionPublicKey);
      const decrypted = crypto.decryptFromPeer(encrypted, receiverKeys.encryptionPrivateKey);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts JSON payloads correctly', () => {
      const receiverKeys = crypto.generateKeyPair();
      const payload = JSON.stringify({
        outageId: 'abc-123',
        region: 'ap-southeast-1',
        severity: 'major',
        reportCount: 150,
      });

      const encrypted = crypto.encryptForPeer(payload, receiverKeys.encryptionPublicKey);
      const decrypted = crypto.decryptFromPeer(encrypted, receiverKeys.encryptionPrivateKey);

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
    });

    it('rejects decryption with the wrong key', () => {
      const receiverKeys = crypto.generateKeyPair();
      const wrongKeys = crypto.generateKeyPair();

      const plaintext = 'Should not be decryptable with wrong key';
      const encrypted = crypto.encryptForPeer(plaintext, receiverKeys.encryptionPublicKey);

      expect(() => crypto.decryptFromPeer(encrypted, wrongKeys.encryptionPrivateKey)).toThrow();
    });
  });
});

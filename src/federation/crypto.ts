/**
 * Cryptographic operations for federation message signing and encryption.
 *
 * Uses Node.js built-in crypto module with Ed25519 for signing
 * and X25519 + AES-256-GCM for encryption.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  diffieHellman,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  type KeyObject,
} from 'node:crypto';

import type { KeyPair } from './types.js';

export class FederationCrypto {
  /**
   * Generate an Ed25519 key pair for signing and an X25519 key pair for encryption.
   * Returns base64-encoded DER keys.
   */
  generateKeyPair(): KeyPair {
    const signing = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    const encryption = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    return {
      publicKey: signing.publicKey.toString('base64'),
      privateKey: signing.privateKey.toString('base64'),
      encryptionPublicKey: encryption.publicKey.toString('base64'),
      encryptionPrivateKey: encryption.privateKey.toString('base64'),
    };
  }

  /**
   * Sign data with an Ed25519 private key.
   * @returns base64-encoded signature
   */
  sign(data: string, privateKeyBase64: string): string {
    const keyObject = this.loadPrivateKey(privateKeyBase64, 'ed25519');
    const signature = sign(null, Buffer.from(data, 'utf-8'), keyObject);
    return signature.toString('base64');
  }

  /**
   * Verify an Ed25519 signature.
   * @returns true if the signature is valid
   */
  verify(data: string, signatureBase64: string, publicKeyBase64: string): boolean {
    try {
      const keyObject = this.loadPublicKey(publicKeyBase64);
      const signature = Buffer.from(signatureBase64, 'base64');
      return verify(null, Buffer.from(data, 'utf-8'), keyObject, signature);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt data for a specific peer using ECDH key agreement + AES-256-GCM.
   *
   * Generates an ephemeral X25519 key pair, derives a shared secret with the
   * peer's X25519 encryption public key, then encrypts with AES-256-GCM.
   * The output includes the ephemeral public key, IV, auth tag, and ciphertext
   * -- all base64-encoded and concatenated with colons.
   *
   * @param data plaintext to encrypt
   * @param peerEncryptionPublicKey the peer's X25519 public key (base64 DER)
   */
  encryptForPeer(data: string, peerEncryptionPublicKey: string): string {
    const ephemeral = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    const peerPublic = createPublicKey({
      key: Buffer.from(peerEncryptionPublicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const ephemeralPrivate = createPrivateKey({
      key: ephemeral.privateKey,
      format: 'der',
      type: 'pkcs8',
    });

    const sharedSecret = diffieHellman({
      privateKey: ephemeralPrivate,
      publicKey: peerPublic,
    });

    const derivedKey = createHash('sha256').update(sharedSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ephemeral.publicKey.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt data received from a peer.
   *
   * Parses the ephemeral public key, IV, auth tag, and ciphertext from the
   * colon-delimited input, derives the shared secret using the receiver's
   * X25519 private key, and decrypts.
   *
   * @param encryptedData colon-delimited encrypted payload
   * @param encryptionPrivateKey the receiver's X25519 private key (base64 DER)
   */
  decryptFromPeer(encryptedData: string, encryptionPrivateKey: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [ephemeralPubB64, ivB64, authTagB64, ciphertextB64] = parts as [
      string,
      string,
      string,
      string,
    ];

    const ephemeralPublic = createPublicKey({
      key: Buffer.from(ephemeralPubB64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const receiverPrivate = createPrivateKey({
      key: Buffer.from(encryptionPrivateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });

    const sharedSecret = diffieHellman({
      privateKey: receiverPrivate,
      publicKey: ephemeralPublic,
    });

    const derivedKey = createHash('sha256').update(sharedSecret).digest();
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  }

  private loadPrivateKey(base64Key: string, _type?: string): KeyObject {
    return createPrivateKey({
      key: Buffer.from(base64Key, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  }

  private loadPublicKey(base64Key: string): KeyObject {
    return createPublicKey({
      key: Buffer.from(base64Key, 'base64'),
      format: 'der',
      type: 'spki',
    });
  }
}

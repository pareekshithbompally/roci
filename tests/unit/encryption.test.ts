/**
 * Encryption Service Tests
 * Tests for API key encryption/decryption
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { encryptionService } from '../../services/storage/encryption.service';

describe('EncryptionService', () => {
  beforeEach(() => {
    // Clear device key before each test
    encryptionService.clearDeviceKey();
    localStorage.clear();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string correctly', async () => {
      const plaintext = 'AIzaSyDemoApiKey12345';
      
      const encrypted = await encryptionService.encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
      
      const decrypted = await encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should return empty string for empty input', async () => {
      expect(await encryptionService.encrypt('')).toBe('');
      expect(await encryptionService.decrypt('')).toBe('');
    });

    it('should handle whitespace-only strings', async () => {
      const whitespace = '   ';
      expect(await encryptionService.encrypt(whitespace)).toBe(whitespace);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'test-api-key';
      
      const encrypted1 = await encryptionService.encrypt(plaintext);
      const encrypted2 = await encryptionService.encrypt(plaintext);
      
      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(await encryptionService.decrypt(encrypted1)).toBe(plaintext);
      expect(await encryptionService.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle special characters', async () => {
      const specialChars = 'key!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      
      const encrypted = await encryptionService.encrypt(specialChars);
      const decrypted = await encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(specialChars);
    });

    it('should handle long strings', async () => {
      const longString = 'A'.repeat(1000);
      
      const encrypted = await encryptionService.encrypt(longString);
      const decrypted = await encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(longString);
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted strings', async () => {
      const plaintext = 'test-api-key';
      const encrypted = await encryptionService.encrypt(plaintext);
      
      expect(encryptionService.isEncrypted(encrypted)).toBe(true);
      expect(encryptionService.isEncrypted(plaintext)).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(encryptionService.isEncrypted('')).toBe(false);
      expect(encryptionService.isEncrypted('   ')).toBe(false);
    });

    it('should return false for short strings', () => {
      expect(encryptionService.isEncrypted('short')).toBe(false);
    });

    it('should return false for non-base64 strings', () => {
      expect(encryptionService.isEncrypted('this is not base64!')).toBe(false);
    });
  });

  describe('device key management', () => {
    it('should generate and persist device key', async () => {
      const plaintext = 'test-key';
      
      // First encryption should generate device key
      await encryptionService.encrypt(plaintext);
      const deviceKey1 = localStorage.getItem('_kasset_device_key');
      expect(deviceKey1).toBeTruthy();
      expect(deviceKey1!.length).toBe(64); // 32 bytes = 64 hex chars
      
      // Second encryption should reuse same device key
      await encryptionService.encrypt(plaintext);
      const deviceKey2 = localStorage.getItem('_kasset_device_key');
      expect(deviceKey2).toBe(deviceKey1);
    });

    it('should use consistent device key for decryption', async () => {
      const plaintext = 'my-secret-key';
      
      const encrypted = await encryptionService.encrypt(plaintext);
      
      // Decrypt should work with same device key
      const decrypted = await encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle device key reset', async () => {
      const plaintext = 'test-key';
      const encrypted1 = await encryptionService.encrypt(plaintext);
      
      // Clear device key
      encryptionService.clearDeviceKey();
      
      // New encryption should use different device key
      const encrypted2 = await encryptionService.encrypt(plaintext);
      
      // Encrypted values should be different
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('error handling', () => {
    it('should return original value if decryption fails', async () => {
      const invalidEncrypted = 'this-is-not-valid-encrypted-data-but-looks-like-base64-AAAAAAAAAAAAAAAAAAAA';
      
      const result = await encryptionService.decrypt(invalidEncrypted);
      expect(result).toBe(invalidEncrypted);
    });
  });

  describe('real-world scenarios', () => {
    it('should encrypt multiple API keys independently', async () => {
      const geminiKey = 'AIzaSyDemoGeminiKey12345';
      const openaiKey = 'sk-demo-openai-key-67890';
      
      const encGemini = await encryptionService.encrypt(geminiKey);
      const encOpenai = await encryptionService.encrypt(openaiKey);
      
      expect(encGemini).not.toBe(encOpenai);
      
      expect(await encryptionService.decrypt(encGemini)).toBe(geminiKey);
      expect(await encryptionService.decrypt(encOpenai)).toBe(openaiKey);
    });

    it('should handle encryption of already encrypted data', async () => {
      const plaintext = 'original-key';
      
      const encrypted1 = await encryptionService.encrypt(plaintext);
      expect(encryptionService.isEncrypted(encrypted1)).toBe(true);
      
      // Encrypting again should work (double encryption)
      const encrypted2 = await encryptionService.encrypt(encrypted1);
      expect(encryptionService.isEncrypted(encrypted2)).toBe(true);
      
      // Decrypt once gets the first encrypted value
      const decrypted1 = await encryptionService.decrypt(encrypted2);
      expect(decrypted1).toBe(encrypted1);
      
      // Decrypt again gets original
      const decrypted2 = await encryptionService.decrypt(decrypted1);
      expect(decrypted2).toBe(plaintext);
    });
  });
});

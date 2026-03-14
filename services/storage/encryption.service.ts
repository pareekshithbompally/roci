/**
 * Encryption Service
 * Handles encryption/decryption of sensitive data (API keys)
 * Uses AES-256-GCM with device-specific key derivation
 */

/**
 * Simple encryption utility using Web Crypto API
 * Note: This uses a device-specific salt for key derivation
 */
class EncryptionService {
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12; // 96 bits for GCM
  private readonly SALT_LENGTH = 16;
  private readonly ITERATIONS = 100000;
  
  // Device-specific identifier (will be generated once per device)
  private deviceKey: string | null = null;

  /**
   * Get or generate device-specific encryption key
   * This is stored in localStorage (not ideal but better than nothing)
   */
  private async getDeviceKey(): Promise<string> {
    if (this.deviceKey) {
      return this.deviceKey;
    }

    // Try to get existing key from localStorage
    const stored = localStorage.getItem('_kasset_device_key');
    if (stored) {
      this.deviceKey = stored;
      return stored;
    }

    // Generate new device key
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const key = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    
    localStorage.setItem('_kasset_device_key', key);
    this.deviceKey = key;
    return key;
  }

  /**
   * Derive encryption key from device key and salt
   */
  private async deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    const deviceKey = await this.getDeviceKey();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(deviceKey),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a string value
   * Returns base64-encoded encrypted data with format: salt.iv.ciphertext
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.trim() === '') {
      return plaintext;
    }

    try {
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Derive key from device key + salt
      const key = await this.deriveKey(salt);

      // Encrypt the data
      const encoded = new TextEncoder().encode(plaintext);
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        key,
        encoded
      );

      // Combine salt + iv + ciphertext and encode as base64
      const combined = new Uint8Array(
        salt.length + iv.length + ciphertext.byteLength
      );
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('[EncryptionService] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted string
   * Expects base64-encoded data with format: salt.iv.ciphertext
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!encryptedData || encryptedData.trim() === '') {
      return encryptedData;
    }

    try {
      // Decode base64
      const combined = this.base64ToArrayBuffer(encryptedData);

      // Extract salt, iv, and ciphertext
      const salt = combined.slice(0, this.SALT_LENGTH);
      const iv = combined.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const ciphertext = combined.slice(this.SALT_LENGTH + this.IV_LENGTH);

      // Derive key from device key + salt
      const key = await this.deriveKey(salt);

      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        key,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('[EncryptionService] Decryption failed:', error);
      // Return original data if decryption fails (might be unencrypted old data)
      return encryptedData;
    }
  }

  /**
   * Check if a string is encrypted (heuristic check)
   */
  isEncrypted(data: string): boolean {
    if (!data || data.trim() === '') {
      return false;
    }
    
    // Encrypted data should be base64 and have minimum length
    // (salt + iv + some ciphertext = at least ~40 chars in base64)
    if (data.length < 40) {
      return false;
    }
    
    // Check if it's valid base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return base64Regex.test(data);
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Clear device key (for testing or reset)
   */
  clearDeviceKey(): void {
    this.deviceKey = null;
    localStorage.removeItem('_kasset_device_key');
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

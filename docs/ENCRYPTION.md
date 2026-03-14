# API Key Encryption Implementation

## Overview

File-based encryption for API keys and sensitive credentials in Kasset AI.

**Status**: ✅ Implemented (v0.1.0)  
**Algorithm**: AES-256-GCM  
**Key Derivation**: PBKDF2 (100,000 iterations, SHA-256)

---

## How It Works

### 1. Device-Specific Key Generation

On first use, the system generates a random 256-bit device key:
- Stored in `localStorage` as `_kasset_device_key`
- Used as base material for encryption key derivation
- Persists across app restarts

### 2. Encryption Process

For each API key to be encrypted:
1. Generate random 128-bit salt
2. Generate random 96-bit IV (Initialization Vector)
3. Derive encryption key using PBKDF2(device key + salt)
4. Encrypt plaintext using AES-256-GCM
5. Combine: `salt + iv + ciphertext` → base64 encode

**Result**: Each encrypted value is unique even for identical inputs (random IV/salt).

### 3. Storage Locations

| Location | Path | Encryption |
|----------|------|------------|
| **Tauri File System** | `~/Library/Application Support/ai.kasset.app/settings.json` | ✅ Encrypted |
| **Browser localStorage** | `kasset_ai_settings` | ✅ Encrypted |
| **Provider configs** | `kasset_ai_model_providers` | ✅ Encrypted |

### 4. Decryption Process

When loading settings:
1. Detect encrypted data (base64 format, minimum length)
2. Decode base64 → extract salt, IV, ciphertext
3. Derive same encryption key using PBKDF2(device key + salt)
4. Decrypt ciphertext using AES-256-GCM with IV
5. Return plaintext API key

---

## Security Properties

### ✅ **Strengths**

1. **Encrypted at rest** - Keys stored as ciphertext in files
2. **Unique ciphertexts** - Random IV/salt prevents pattern analysis
3. **Strong encryption** - AES-256-GCM with authenticated encryption
4. **Key derivation** - PBKDF2 with 100k iterations slows brute force
5. **Device-specific** - Keys cannot be easily moved between devices
6. **Automatic migration** - Old plaintext keys detected and encrypted on next save

### ⚠️ **Limitations**

1. **Device key in localStorage** - Device key itself is not encrypted
   - Vulnerable to disk access or malware with localStorage access
   - Better than plaintext, but not as secure as system keychain

2. **Memory exposure** - Keys decrypted in memory during use
   - Visible to debuggers or memory dumps during runtime
   - Cleared on app close, but vulnerable while running

3. **No key rotation** - Once encrypted, keys stay encrypted with same device key
   - If device key compromised, all keys exposed

4. **Web Crypto API dependency** - Requires browser crypto support
   - Works in all modern browsers and Tauri
   - No fallback for unsupported environments

---

## Files Modified

### Core Implementation

- **`services/storage/encryption.service.ts`** - Main encryption service
  - `encrypt(plaintext)` - Encrypt sensitive strings
  - `decrypt(encrypted)` - Decrypt encrypted strings
  - `isEncrypted(data)` - Heuristic to detect encrypted data

### Integration Points

- **`services/storage/settings.service.ts`** - File system storage
  - Encrypts on `save()`: `geminiApiKey`, `apiKey`, etc.
  - Decrypts on `load()`

- **`src/shared/contexts/SettingsContext.tsx`** - localStorage storage
  - Encrypts `apiKey` before saving to localStorage
  - Encrypts `api_key` in provider settings
  - Decrypts on load

### Sensitive Keys List

Automatically encrypted fields:
```typescript
['geminiApiKey', 'apiKey', 'openaiApiKey', 'anthropicApiKey']
```

Add more by updating `SENSITIVE_KEYS` array in `settings.service.ts`.

---

## Usage Examples

### Manual Encryption

```typescript
import { encryptionService } from '@/services/storage';

// Encrypt an API key
const encrypted = await encryptionService.encrypt('AIzaSyDemo123...');
console.log(encrypted); // "aGVsbG8gd29ybGQhISE..." (base64)

// Decrypt
const decrypted = await encryptionService.decrypt(encrypted);
console.log(decrypted); // "AIzaSyDemo123..."

// Check if encrypted
if (encryptionService.isEncrypted(someValue)) {
  const plaintext = await encryptionService.decrypt(someValue);
}
```

### Automatic Encryption (via Settings)

```typescript
import { settingsService } from '@/services/storage';

// Save settings - API key automatically encrypted
await settingsService.save({
  geminiApiKey: 'AIzaSyDemo123...',
  // ... other settings
});

// Load settings - API key automatically decrypted
const result = await settingsService.load();
console.log(result.data.geminiApiKey); // Plaintext for use
```

---

## Testing

Run encryption tests:
```bash
npx vitest tests/unit/encryption.test.ts
```

Tests cover:
- ✅ Basic encrypt/decrypt roundtrip
- ✅ Multiple encryptions produce different ciphertexts
- ✅ Empty/whitespace handling
- ✅ Special characters and long strings
- ✅ Device key generation and persistence
- ✅ Detection of encrypted data
- ✅ Error handling for invalid data

---

## Migration Path

### Existing Users (Pre-Encryption)

1. **On first run after update**:
   - Old plaintext keys detected in settings
   - Next `save()` call encrypts them automatically
   - File updated with encrypted values

2. **No user action required**:
   - Transparent migration on next settings change
   - Original keys remain functional until next save

### Backwards Compatibility

- **Decrypt handles plaintext**: If decryption fails, returns original value
- **isEncrypted() heuristic**: Only tries to decrypt if data looks encrypted

---

## Future Improvements (Optional)

If stricter security needed:

1. **System Keychain Integration** (macOS)
   - Store device key in macOS Keychain instead of localStorage
   - Requires: Tauri plugin or Rust `keyring` crate

2. **Key Rotation**
   - Add ability to re-encrypt all keys with new device key
   - Triggered by user or on schedule

3. **Memory Protection**
   - Zero-out plaintext keys in memory after use
   - Use secure memory allocation (Rust SecureString)

4. **App-Level Password**
   - Optional master password to encrypt device key
   - User enters on startup, protects all keys

---

## Security Audit Results

### Before Implementation
- ❌ API keys stored in **plain text** in JSON files
- ❌ No encryption in localStorage
- ❌ File permissions only protection

### After Implementation
- ✅ API keys **encrypted at rest** (AES-256-GCM)
- ✅ Automatic encryption on save
- ✅ Transparent decryption on load
- ⚠️ Device key in localStorage (acceptable trade-off)

**Recommendation**: Current implementation is **sufficient for most use cases**. Keychain integration is overkill unless handling enterprise/high-security scenarios.

---

## Questions?

- **Where are keys stored?** → `~/Library/Application Support/ai.kasset.app/settings.json`
- **What if I lose device key?** → Keys unrecoverable, user must re-enter API keys
- **Can I export keys?** → No, keys are device-bound and encrypted
- **Is it secure?** → Yes, much better than plaintext. Not perfect, but good balance of security and usability.

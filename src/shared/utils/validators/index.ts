export function isEmpty(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function hasValidExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? allowedExtensions.includes(ext) : false;
}

export function isValidFileSize(sizeInBytes: number, maxSizeInMB: number): boolean {
  return sizeInBytes <= maxSizeInMB * 1024 * 1024;
}

export function isValidAudioFile(file: File, maxSizeMB: number = 500): { valid: boolean; error?: string } {
  const allowedTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
  const allowedExtensions = ['mp3', 'wav', 'webm', 'ogg', 'm4a', 'mp4'];

  if (!allowedTypes.includes(file.type) && !hasValidExtension(file.name, allowedExtensions)) {
    return { valid: false, error: 'Invalid audio format. Supported: MP3, WAV, WebM, OGG, M4A' };
  }

  if (!isValidFileSize(file.size, maxSizeMB)) {
    return { valid: false, error: `File too large. Maximum size: ${maxSizeMB}MB` };
  }

  return { valid: true };
}

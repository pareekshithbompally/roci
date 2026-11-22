import { APP_CONFIG } from '@config/app.config';

const MAX_FILE_SIZE = APP_CONFIG.chat.maxAttachmentSizeBytes;

/** A picked file as a data URL (what an attachment part carries), within the attachment size limit. */
export function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    return Promise.reject(new Error(`File "${file.name}" exceeds ${APP_CONFIG.chat.maxAttachmentSizeMB}MB limit.`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** The text a `data:` URL carries, decoded as UTF-8; null when it isn't one or doesn't decode. */
export function dataUrlText(url: string): string | null {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  try {
    if (!match[1]) return decodeURIComponent(match[2]);
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

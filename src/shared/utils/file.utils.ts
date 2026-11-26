import { APP_CONFIG } from '@config/app.config';

const MAX_FILE_SIZE = APP_CONFIG.chat.maxAttachmentSizeBytes;

/** A picked file's bytes, within the attachment size limit. */
export async function attachmentBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`File "${file.name}" exceeds ${APP_CONFIG.chat.maxAttachmentSizeMB}MB limit.`);
  return new Uint8Array(await file.arrayBuffer());
}

/** Bytes as a `data:` URL (what a model's file part takes), read by the platform's own FileReader. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A file's extension from its name ("Q3 plan.PDF" → "pdf"); `bin` when it has none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : 'bin';
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

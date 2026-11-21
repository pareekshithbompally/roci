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

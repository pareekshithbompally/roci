import { APP_CONFIG } from '@config/app.config';

const MAX_FILE_SIZE = APP_CONFIG.chat.maxAttachmentSizeBytes;

export function fileToBase64(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    return Promise.reject(new Error(`File "${file.name}" exceeds ${APP_CONFIG.chat.maxAttachmentSizeMB}MB limit.`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Strip "data:mime;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * File utilities for handling file-to-base64 conversion.
 */

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function fileToBase64(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    return Promise.reject(new Error(`File "${file.name}" exceeds 20MB limit.`));
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

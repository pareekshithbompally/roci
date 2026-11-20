/** Gallery: every image made in chat, newest first, grouped by day. */

export const GALLERY_CONFIG = {
  /** Sidebar row and page title. */
  title: 'Gallery',
  empty: 'Images you create in chat appear here.',
  openChat: 'Open chat',
  /** Images made before their details were kept. */
  /** Thumbnails written beside each image: longest side in px, JPEG quality. */
  thumbnail: { maxPx: 512, quality: 0.82 },
  /** Thumbnails per row: phone, then wider windows. */
  grid: 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
} as const;

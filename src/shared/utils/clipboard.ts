/** Copy plain text for editors and terminals, plus HTML for rich targets (Notes, Mail, Docs) when given. */
export async function copyRichText(plain: string, html?: string): Promise<void> {
  if (!html) {
    await navigator.clipboard.writeText(plain);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([plain], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    }),
  ]);
}

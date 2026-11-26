/** A PDF's pages, drawn by pdf.js the same on Mac and iPhone: as wide as their column, each rendered when it nears the view
 *  (a long document never draws every page at once), sharp on the screen's pixels. Given a `page`, it scrolls there and
 *  marks it with the AI's arrival wash (an answer's page pill opened it). */

import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Surface, cn } from '@shared/ui';
import { useElementWidth } from '@shared/hooks/useElementWidth';
import { PDF_PAGES } from '@config/knowledgeLibrary.config';

GlobalWorkerOptions.workerSrc = workerUrl;

/** The document at `src`, read while it is shown and freed after; a file that can't be read goes to `onError`. A lifecycle
 *  (the worker holds the document until destroyed), not cached data, so it is an effect, not a query. */
function usePdf(src: string | null, onError: (error: unknown) => void): PDFDocumentProxy | null {
  const report = useRef(onError);
  report.current = onError;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => {
    if (!src) return;
    let gone = false;
    let task: ReturnType<typeof getDocument> | null = null;
    fetch(src)
      .then((response) => response.arrayBuffer())
      .then((data) => {
        if (gone) return null;
        task = getDocument({ data });
        return task.promise;
      })
      .then((document) => {
        if (document && !gone) setDoc(document);
      })
      .catch((error: unknown) => {
        if (!gone) report.current(error);
      });
    return () => {
      gone = true;
      setDoc(null);
      void task?.destroy();
    };
  }, [src]);
  return doc;
}

interface PageProps {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  marked: boolean;
  pageRef: (node: HTMLDivElement | null) => void;
}

/** One page: its box holds its shape from the start (so scrolling to a page lands true), its canvas drawn once near view. */
function PdfPage({ doc, number, width, marked, pageRef }: PageProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(PDF_PAGES.letterRatio);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const watch = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: PDF_PAGES.renderAhead });
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !canvas.current) return;
    let task: { cancel: () => void } | null = null;
    doc.getPage(number).then((page) => {
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const viewport = page.getViewport({ scale: (width / base.width) * window.devicePixelRatio });
      const target = canvas.current;
      if (!target) return;
      target.width = viewport.width;
      target.height = viewport.height;
      const render = page.render({ canvas: target, viewport });
      task = render;
      return render.promise;
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name !== 'RenderingCancelledException') console.error('[PdfPages] Page not drawn:', number, error);
    });
    return () => task?.cancel();
  }, [doc, number, width, near]);

  return (
    <div
      ref={(node) => {
        box.current = node;
        pageRef(node);
      }}
      className={cn('rounded-md p-1', marked && 'motion-safe:animate-ai-arrive')}
    >
      <Surface variant="card" radius="md" className="overflow-hidden" style={{ width, height: width * ratio }}>
        <canvas ref={canvas} aria-label={PDF_PAGES.pageLabel(number)} className="block size-full" />
      </Surface>
    </div>
  );
}

export interface PdfPagesProps {
  /** The PDF's URL (a kept file's asset URL). */
  src: string | null;
  /** A page to show and mark (from 1); its change scrolls there. */
  page?: number;
  onError: (error: unknown) => void;
}

export function PdfPages({ src, page, onError }: PdfPagesProps) {
  const doc = usePdf(src, onError);
  const column = useRef<HTMLDivElement>(null);
  const width = useElementWidth(column);
  const pages = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (!doc || !page) return;
    pages.current.get(page)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [doc, page]);

  const pageWidth = width === null ? null : Math.min(width, PDF_PAGES.maxWidth);
  return (
    <div ref={column} className="flex w-full flex-col items-center gap-4">
      {doc && pageWidth !== null && Array.from({ length: doc.numPages }, (_, i) => i + 1).map((number) => (
        <PdfPage
          key={number}
          doc={doc}
          number={number}
          width={pageWidth}
          marked={number === page}
          pageRef={(node) => (node ? pages.current.set(number, node) : pages.current.delete(number))}
        />
      ))}
    </div>
  );
}

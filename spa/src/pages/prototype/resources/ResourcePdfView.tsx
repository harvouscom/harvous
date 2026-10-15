/**
 * A PDF drawn page by page into the viewer with pdf.js.
 *
 * Not an `<iframe>` of the file: that would need the storage host in the CSP's
 * `frame-src`, and iOS Safari draws only the first page of a framed PDF — the installed
 * PWA would show a handout's cover and nothing else. pdf.js renders the same everywhere.
 *
 * Pages render as they scroll near, so a 200-page commentary costs what you look at.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ProtoSpaceLoading from '../ProtoSpaceLoading';

GlobalWorkerOptions.workerSrc = workerSrc;

export default function ResourcePdfView({
  url,
  title,
  fallback,
}: {
  url: string;
  title: string;
  /** Shown when the file will not parse — the card, with its way out. */
  fallback: ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.294); // US Letter until page one says otherwise
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    /* No eval: the font program compiler is faster with it, but the CSP allows it only
       for legacy reasons and a hostile PDF is exactly what it should not get to run. */
    const task = getDocument({ url, isEvalSupported: false });
    task.promise
      .then(async (pdf) => {
        if (cancelled) return;
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspect(viewport.height / viewport.width);
        setDoc(pdf);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  if (failed) return <>{fallback}</>;
  if (!doc) return <ProtoSpaceLoading label="Opening PDF" />;

  return (
    <div className="proto-resource-pdf" role="document" aria-label={title}>
      <p className="proto-caption proto-resource-pdf__count">
        {doc.numPages} {doc.numPages === 1 ? 'page' : 'pages'}
      </p>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={i} doc={doc} pageNumber={i + 1} aspect={aspect} />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  pageNumber,
  aspect,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** Height over width, from page one — a placeholder that holds the scroll steady. */
  aspect: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);
  const [pageAspect, setPageAspect] = useState<number | null>(null);

  useEffect(() => {
    if (near) return undefined;
    const frame = frameRef.current;
    if (!frame) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return undefined;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const frame = frameRef.current;
        if (cancelled || !canvas || !frame) return;
        const base = page.getViewport({ scale: 1 });
        setPageAspect(base.height / base.width);
        /* Drawn at the frame's width in device pixels, so text stays sharp on a retina
           screen without rendering a 4x bitmap nobody can see. */
        const cssWidth = frame.clientWidth || base.width;
        const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        renderTask = task;
        await task.promise;
      } catch {
        /* A cancelled render rejects; a broken page stays a blank frame rather than
           taking the rest of the document down with it. */
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [near, doc, pageNumber]);

  return (
    <div
      ref={frameRef}
      className="proto-resource-pdf__page"
      style={{ aspectRatio: `1 / ${pageAspect ?? aspect}` }}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
    </div>
  );
}

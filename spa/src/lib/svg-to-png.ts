/**
 * Draw an SVG string onto a canvas and hand back a PNG.
 *
 * For the church join QR: the server renders the SVG (so no QR encoder ships in the
 * app bundle), and a PNG is what slide software and church-management email tools
 * reliably accept. Drawn at a fixed large size so a projected or printed code stays
 * crisp; the QR's own white quiet zone is already in the SVG.
 */
export async function svgToPngBlob(svg: string, size = 2048): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read the QR image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    // Crisp module edges: smoothing would blur the squares a scanner reads.
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the PNG'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a blob under a filename via a temporary link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filename-safe slug from a church name: "New Hope Assembly" → "new-hope-assembly". */
export function filenameSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'church';
}

/**
 * The church join poster as a file: the card the Invite link pane previews, so what staff
 * download for a bulletin, slide or Christmas Eve handout is what they saw on screen —
 * "Scan to join on Harvous", the church's name, the code, and the address under it.
 *
 * Built as one SVG with the server's QR nested in it, so the SVG download stays vector at any
 * print size and the PNG is the same drawing on a canvas (`svgToPngBlob`). Always black on
 * white, whatever the app's theme: that is the version that prints and scans.
 *
 * Text uses system fonts on purpose. An SVG drawn through an <img> cannot load web fonts, and a
 * downloaded file opened elsewhere will not have Harvous's, so naming them would only make the
 * PNG and the SVG disagree.
 */

export const JOIN_POSTER_WIDTH = 1200;
export const JOIN_POSTER_HEIGHT = 1500;

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const NAME_LINE_CHARS = 22;
const NAME_MAX_LINES = 3;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Break a church name into at most three balanced-enough lines, on spaces. */
export function posterNameLines(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= NAME_LINE_CHARS) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  if (lines.length <= NAME_MAX_LINES) return lines;
  const kept = lines.slice(0, NAME_MAX_LINES);
  kept[NAME_MAX_LINES - 1] = `${kept[NAME_MAX_LINES - 1]}…`;
  return kept;
}

/** Place the server's QR SVG at a position and size inside the poster, keeping it vector. */
function nestQr(qrSvg: string, x: number, y: number, size: number): string {
  const open = qrSvg.match(/<svg\b[^>]*>/i);
  if (!open) return '';
  /* Drop any size or position the server's root carries; the viewBox keeps its proportions. */
  const attrs = open[0]
    .replace(/^<svg\b/i, '')
    .replace(/>$/, '')
    .replace(/\s(?:x|y|width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  const body = qrSvg.slice((open.index ?? 0) + open[0].length);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}"${attrs}>${body}`;
}

export function joinPosterSvg({
  churchName,
  qrSvg,
  url,
}: {
  churchName: string;
  qrSvg: string;
  url: string;
}): string {
  const W = JOIN_POSTER_WIDTH;
  const H = JOIN_POSTER_HEIGHT;
  const cx = W / 2;
  const nameLines = posterNameLines(churchName);
  const nameSize = nameLines.length > 2 ? 72 : 84;
  const nameLead = Math.round(nameSize * 1.15);
  const eyebrowY = 190;
  const nameTop = eyebrowY + 70 + nameSize;
  const qrSize = 720;
  const qrY = H - 160 - qrSize - 60;
  const address = url.replace(/^https?:\/\//, '');

  const name = nameLines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${nameTop + i * nameLead}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="700" fill="#111111" letter-spacing="-1">${escapeXml(line)}</text>`,
    )
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${cx}" y="${eyebrowY}" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="500" fill="#5f5f5f">Scan to join on Harvous</text>`,
    name,
    nestQr(qrSvg, (W - qrSize) / 2, qrY, qrSize),
    `<text x="${cx}" y="${H - 150}" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#5f5f5f">${escapeXml(address)}</text>`,
    `</svg>`,
  ].join('');
}

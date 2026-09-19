import zlib from "node:zlib";

/**
 * Minimal, dependency-free reader for the PDFs Chrome's print pipeline emits.
 *
 * The controlled reports are now asserted from the *printed artifact* rather
 * than only from the DOM: pagination and the `@page` running footer live
 * outside the document tree, so nothing in the app (or Playwright's locators)
 * can observe them. Chrome writes subset fonts with per-font `/ToUnicode`
 * CMaps, so the glyphs in the content streams are decoded back to characters
 * here — no Ghostscript, no pdf.js, no network.
 *
 * Scope is deliberately narrow: text objects (`BT` … `ET`) and the `Tj` / `TJ`
 * show operators. Layout, images and vector art are ignored.
 */

export interface PdfText {
  /** Number of page objects in the file, in document order. */
  pageCount: number;
  /** Concatenated decoded text per page. */
  pages: string[];
  /** All pages joined — convenient for `toContain` assertions. */
  text: string;
  /** Every `Page n of m` line found, in page order. */
  footers: string[];
}

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

/** Index every `n 0 obj … endobj` in the file. */
function parseObjects(raw: string, buf: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const re = /(?:^|[\s>])(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const id = Number(match[1]);
    const streamAt = raw.indexOf("stream", match.index);
    const dict = raw.slice(match.index, streamAt === -1 ? match.index + 600 : streamAt);
    let stream: Buffer | null = null;
    if (streamAt !== -1) {
      let start = streamAt + 6;
      while (buf[start] === 13 || buf[start] === 10) start++;
      const end = raw.indexOf("endstream", start);
      if (end !== -1) stream = buf.subarray(start, end);
    }
    objects.set(id, { dict, stream });
  }
  return objects;
}

/** Streams are Flate-compressed in practice; fall back to the raw bytes. */
function inflate(stream: Buffer | null): string | null {
  if (stream === null) return null;
  try {
    return zlib.inflateSync(stream).toString("latin1");
  } catch {
    return stream.toString("latin1");
  }
}

/** Glyph code → character, from a CMap's `bfchar` and `bfrange` sections. */
function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const units = (hex: string): string => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(pair[1] ?? "", 16), units(pair[2] ?? ""));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let range: RegExpExecArray | null;
    while ((range = re.exec(block[1] ?? "")) !== null) {
      const lo = parseInt(range[1] ?? "", 16);
      const hi = parseInt(range[2] ?? "", 16);
      const base = parseInt(range[3] ?? "", 16);
      for (let code = lo; code <= hi; code++) {
        map.set(code, String.fromCharCode(base + (code - lo)));
      }
    }
  }
  return map;
}

/** Page-level `/F4 → object number` map from the page's `/Font` resource dict. */
function fontResources(dict: string): Map<string, number> {
  const names = new Map<string, number>();
  const block = /\/Font\s*<<([\s\S]*?)>>/.exec(dict);
  if (block === null) return names;
  for (const font of (block[1] ?? "").matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
    names.set(font[1] ?? "", Number(font[2] ?? "0"));
  }
  return names;
}

/**
 * Text of one content stream. Characters inside a single `BT` … `ET` are joined
 * without separators (Chrome positions each glyph individually) and separate
 * text objects are space-joined, which is what makes `Page 1 of 5` readable.
 */
function decodeContent(text: string, fonts: Map<string, number>): string {
  const chunks: string[] = [];
  for (const block of text.matchAll(/BT([\s\S]*?)ET/g)) {
    let fontId: number | null = null;
    let out = "";
    const tokens = (block[1] ?? "").matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>|\[([\s\S]*?)\]\s*TJ/g);
    for (const token of tokens) {
      if (token[1] !== undefined) {
        fontId = fonts.get(token[1]) ?? null;
        continue;
      }
      const cmap = cmapCache.get(fontId ?? -1);
      if (cmap === undefined) continue;
      const hexes =
        token[2] !== undefined
          ? [token[2]]
          : [...(token[3] ?? "").matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => x[1] ?? "");
      for (const hex of hexes) {
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          out += cmap.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
        }
      }
    }
    if (out.length > 0) chunks.push(out);
  }
  return chunks.join(" ");
}

/** Filled once per `extractPdfText` call — font object id → its CMap. */
const cmapCache = new Map<number, Map<number, string>>();

export function extractPdfText(bytes: Buffer): PdfText {
  cmapCache.clear();
  const raw = bytes.toString("latin1");
  const objects = parseObjects(raw, bytes);

  for (const [id, object] of objects) {
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.dict);
    if (ref === null) continue;
    const target = objects.get(Number(ref[1]));
    const cmapText = target === undefined ? null : inflate(target.stream);
    if (cmapText !== null) cmapCache.set(id, parseCMap(cmapText));
  }

  const pages: string[] = [];
  for (const [, object] of objects) {
    if (!/\/Type\s*\/Page[^s]/.test(object.dict)) continue;
    const fonts = fontResources(object.dict);
    const streamIds = contentStreamIds(object.dict);
    let pageText = "";
    for (const id of streamIds) {
      const stream = objects.get(id);
      const content = stream === undefined ? null : inflate(stream.stream);
      if (content !== null) pageText += `${decodeContent(content, fonts)}\n`;
    }
    pages.push(pageText);
  }

  const text = pages.join("\n");
  return {
    pageCount: pages.length,
    pages,
    text,
    footers: [...text.matchAll(/Page\s+\d+\s+of\s+\d+/g)].map((m) =>
      (m[0] ?? "").replace(/\s+/g, " "),
    ),
  };
}

/** `/Contents 12 0 R` or `/Contents [12 0 R 13 0 R]`. */
function contentStreamIds(dict: string): number[] {
  const single = /\/Contents\s+(\d+)\s+0\s+R/.exec(dict);
  if (single !== null) return [Number(single[1])];
  const array = /\/Contents\s*\[([^\]]*)\]/.exec(dict);
  if (array === null) return [];
  return [...(array[1] ?? "").matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1] ?? "0"));
}

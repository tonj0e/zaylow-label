/**
 * Turns a piece of the page (a label, a warranty card) into a picture.
 * It uses the browser's own text layout, so the picture matches the screen. The web fonts are fetched once
 * and only the fonts the picture really uses (Latin letters) are placed inside it, which keeps it fast.
 */
interface FontBlock { family: string; css: string }
let fontBlocks: Promise<FontBlock[]> | null = null;

const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/** Download the Google font files once (Latin only) and keep them ready. Safe to call early. */
export const loadFontCss = (): Promise<FontBlock[]> => {
  if (fontBlocks) return fontBlocks;
  fontBlocks = (async () => {
    try {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.href);
      const lists = await Promise.all(links.map(async (href) => {
        const raw = await (await fetch(href)).text();
        const blocks = [...raw.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)].filter((m) => m[1] === 'latin').map((m) => m[2]);
        return Promise.all(blocks.map(async (blk): Promise<FontBlock> => {
          const family = (blk.match(/font-family:\s*['"]?([^'";]+)['"]?/)?.[1] || '').trim();
          const u = blk.match(/url\((https:[^)]+)\)/)?.[1];
          if (!u) return { family, css: blk };
          try { return { family, css: blk.split(u).join(await toDataUrl(await (await fetch(u)).blob())) }; } catch { return { family, css: blk }; }
        }));
      }));
      return lists.flat();
    } catch { return []; }
  })();
  return fontBlocks;
};

/** The font families really used inside this element */
const familiesIn = (el: HTMLElement): Set<string> => {
  const used = new Set<string>();
  const nodes: Element[] = [el, ...Array.from(el.querySelectorAll('*'))];
  for (const n of nodes) {
    getComputedStyle(n).fontFamily.split(',').forEach((f) => used.add(f.trim().replace(/^['"]|['"]$/g, '')));
  }
  return used;
};

export const captureCanvas = async (el: HTMLElement, scale = 3, background = '#ffffff'): Promise<HTMLCanvasElement> => {
  const [{ toCanvas }, blocks] = await Promise.all([import('html-to-image'), loadFontCss()]);
  if (document.fonts?.ready) await document.fonts.ready;
  const used = familiesIn(el);
  const fontEmbedCSS = blocks.filter((b) => used.has(b.family)).map((b) => b.css).join('\n');
  // the preview may be shown smaller with a CSS transform; the picture is taken at full size
  return toCanvas(el, { pixelRatio: scale, backgroundColor: background, fontEmbedCSS, style: { transform: 'none', transformOrigin: 'top left' } });
};

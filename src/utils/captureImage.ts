/**
 * Turns a piece of the page (a label, a warranty card) into a picture.
 * It uses the browser's own text layout, so the picture matches the screen. The web fonts are fetched once and
 * placed inside the picture, so the text keeps its real font.
 */
let fontCss: Promise<string> | null = null;

const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

const loadFontCss = (): Promise<string> => {
  if (fontCss) return fontCss;
  fontCss = (async () => {
    try {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.href);
      let out = '';
      for (const href of links) {
        let css = await (await fetch(href)).text();
        const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
        for (const u of urls) {
          try { css = css.split(u).join(await toDataUrl(await (await fetch(u)).blob())); } catch { /* keep the remote link */ }
        }
        out += css;
      }
      return out;
    } catch { return ''; }
  })();
  return fontCss;
};

export const captureCanvas = async (el: HTMLElement, scale = 3, background = '#ffffff'): Promise<HTMLCanvasElement> => {
  const { toCanvas } = await import('html-to-image');
  if (document.fonts?.ready) await document.fonts.ready;
  const fontEmbedCSS = await loadFontCss();
  // the preview may be shown smaller with a CSS transform; the picture is taken at full size
  return toCanvas(el, { pixelRatio: scale, backgroundColor: background, cacheBust: true, fontEmbedCSS, style: { transform: 'none', transformOrigin: 'top left' } });
};

/**
 * Fonts available in the text tool.
 *
 * Arabic-capable families are bundled locally through @fontsource (no network
 * dependency at runtime, identical rendering for every learner). Each family
 * only downloads the font files it needs, when it is first used.
 */
import '@fontsource/cairo/300.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/900.css';
import '@fontsource/tajawal/300.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/900.css';
import '@fontsource/ibm-plex-sans-arabic/300.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/noto-kufi-arabic/300.css';
import '@fontsource/noto-kufi-arabic/400.css';
import '@fontsource/noto-kufi-arabic/600.css';
import '@fontsource/noto-kufi-arabic/700.css';
import '@fontsource/noto-kufi-arabic/900.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/900.css';
import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';

export interface FontFamilyInfo {
  family: string;
  /** Weights with real font files (others are synthesized by the browser). */
  weights: number[];
  arabic: boolean;
  category: 'sans' | 'serif' | 'mono';
}

export const FONT_FAMILIES: FontFamilyInfo[] = [
  { family: 'Cairo', weights: [300, 400, 600, 700, 900], arabic: true, category: 'sans' },
  { family: 'Tajawal', weights: [300, 400, 500, 700, 900], arabic: true, category: 'sans' },
  { family: 'IBM Plex Sans Arabic', weights: [300, 400, 600, 700], arabic: true, category: 'sans' },
  { family: 'Noto Kufi Arabic', weights: [300, 400, 600, 700, 900], arabic: true, category: 'sans' },
  { family: 'Amiri', weights: [400, 700], arabic: true, category: 'serif' },
  { family: 'Inter', weights: [300, 400, 600, 700, 900], arabic: false, category: 'sans' },
  { family: 'Montserrat', weights: [300, 400, 600, 700, 900], arabic: false, category: 'sans' },
  { family: 'Playfair Display', weights: [400, 600, 700, 900], arabic: false, category: 'serif' },
  { family: 'Arial', weights: [400, 700], arabic: true, category: 'sans' },
  { family: 'Georgia', weights: [400, 700], arabic: false, category: 'serif' },
  { family: 'Times New Roman', weights: [400, 700], arabic: true, category: 'serif' },
  { family: 'Courier New', weights: [400, 700], arabic: false, category: 'mono' },
];

export const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
  { value: 900, label: 'Black' },
];

/** Quotes a family name for use in a CSS font shorthand. */
function cssFamily(family: string) {
  return /^[a-z-]+$/i.test(family) ? family : `"${family}"`;
}

/**
 * Ensures a font face is loaded before canvas text is measured with it —
 * otherwise Fabric would measure with a fallback font and the text box would
 * have the wrong size once the real font arrives.
 */
export async function ensureFontLoaded(family: string, weight: number | string = 400, style = 'normal') {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'Aaسما';
  try {
    await document.fonts.load(`${style} ${weight} 32px ${cssFamily(family)}`, sample);
  } catch {
    // A failed load simply falls back to a system font; nothing else to do.
  }
}

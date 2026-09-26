/**
 * Minimal i18n: English and Arabic string tables, selected per workspace via
 * the `locale` prop. Arabic switches the interface to right-to-left; the
 * canvas itself always stays left-to-right (it is a coordinate space).
 */
import { createContext, useCallback, useContext } from 'react';
import { en, type StringKey } from './en';
import { ar } from './ar';

export type Locale = 'en' | 'ar';
export type { StringKey };

const tables: Record<Locale, Partial<Record<StringKey, string>>> = { en, ar };

export const LocaleContext = createContext<Locale>('en');

export function translate(locale: Locale, key: StringKey | string, params?: Record<string, string | number>) {
  let s = tables[locale][key as StringKey] ?? en[key as StringKey] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback(
    (key: StringKey | string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function isRtl(locale: Locale) {
  return locale === 'ar';
}

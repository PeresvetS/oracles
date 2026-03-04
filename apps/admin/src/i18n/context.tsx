'use client';

import { createContext, useContext, useState } from 'react';
import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';
import type { I18nKeys } from '@/i18n/en';

type Locale = 'en' | 'ru';

const locales: Record<Locale, I18nKeys> = { en, ru };

interface I18nContextValue {
  t: I18nKeys;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nContextValue>({
  t: ru,
  locale: 'ru',
  setLocale: () => undefined,
});

interface I18nProviderProps {
  children: React.ReactNode;
  defaultLocale?: Locale;
}

/** Провайдер локализации */
export function I18nProvider({ children, defaultLocale = 'ru' }: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  return (
    <I18nContext.Provider value={{ t: locales[locale], locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Хук для использования локализации */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

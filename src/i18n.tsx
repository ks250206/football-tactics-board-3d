import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import messages from './messages.json';

const languages = [
  ['ja', '日本語'], ['en', 'English'], ['zh-Hans', '简体中文'],
  ['ko', '한국어'], ['es', 'Español'], ['pt-BR', 'Português'],
] as const;
type Language = typeof languages[number][0];
type Translate = (message: string, ...values: (string | number | undefined)[]) => string;
const dictionary: Record<string, string[]> = messages;
const storageKey = 'touchline.language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(storageKey);
    return languages.find(([code]) => code === saved)?.[0] ?? 'ja';
  } catch {
    return 'ja';
  }
}

function translator(language: Language): Translate {
  const index = languages.findIndex(([code]) => code === language) - 1;
  return (message, ...values) => {
    const translated = index >= 0 && Object.hasOwn(dictionary, message) ? dictionary[message][index] ?? message : message;
    return values.length ? translated.replace(/\{(\d+)\}/g, (match, i: string) => String(values[Number(i)] ?? match)) : translated;
  };
}

const LocaleContext = createContext<{ language: Language; setLanguage: (language: Language) => void; t: Translate }>({
  language: 'ja', setLanguage: () => {}, t: translator('ja'),
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(storageKey, language); } catch { /* Language selection still works for this tab. */ }
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: translator(language) }), [language]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT() {
  return useContext(LocaleContext).t;
}

export function LanguageSelect() {
  const { language, setLanguage, t } = useContext(LocaleContext);
  return <select className="language-select" value={language} aria-label={t('表示言語')} title={t('表示言語')}
    onChange={event => {
      const option = languages.find(([code]) => code === event.target.value);
      if (option) setLanguage(option[0]);
    }}>
    {languages.map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
  </select>;
}

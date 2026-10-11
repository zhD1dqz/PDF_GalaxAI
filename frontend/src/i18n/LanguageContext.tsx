import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'zh' | 'en';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  tr: (chinese: string, english: string) => string;
};

const STORAGE_KEY = 'scholar:interface-language';
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get('lang');
      if (requested === 'en' || requested === 'zh') return requested;
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // Storage can be unavailable in private mode; the in-memory choice still works.
    }
  };

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    tr: (chinese, english) => language === 'en' ? english : chinese,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

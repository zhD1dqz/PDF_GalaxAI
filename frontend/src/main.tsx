import '../../index.css';
import 'katex/dist/katex.min.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from './i18n/LanguageContext';
import { App } from './ui/App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);

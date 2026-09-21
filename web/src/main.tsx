import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '@shared/i18n/index.ts';
import { App } from './App.tsx';
import { loadLocale } from '@/i18n.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error(t(loadLocale(), 'app.rootMissing'));

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

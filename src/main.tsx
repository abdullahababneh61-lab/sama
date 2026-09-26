/**
 * Development harness: mounts the workspace full-screen.
 * Query parameters: `?lang=ar` for the Arabic/RTL interface,
 * `?w=1080&h=1350` for the artboard size.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SamaWorkspace } from './workspace/SamaWorkspace';
import './styles/page.css';

const params = new URLSearchParams(location.search);
const locale = params.get('lang') === 'ar' ? 'ar' : 'en';
const width = Number(params.get('w')) || undefined;
const height = Number(params.get('h')) || undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SamaWorkspace locale={locale} documentSettings={{ ...(width && { width }), ...(height && { height }) }} />
  </StrictMode>,
);

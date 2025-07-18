import { createRoot } from 'react-dom/client';
import { Profiler } from 'react';
import App from './App.tsx';
import '@/index.css';
import { reactProfilerOnRender } from '@/shared/lib/logger';

createRoot(document.getElementById('root')!).render(
  <Profiler id="Root" onRender={reactProfilerOnRender}>
    <App />
  </Profiler>
);
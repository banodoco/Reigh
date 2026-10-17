import {
  classifyBrowserEntry,
  prefersAppEntry,
  resolveReturningAppEntry,
} from '@/app/entryClassification.ts';
import { releaseBootLayerWhenReady } from '@/app/bootLayer.ts';
import { migrateAstridBrowserStorage } from '@/migrations/astridRenameBrowserMigration.ts';

function loadInstalledAppTypography(): void {
  if (document.querySelector('[data-installed-app-fonts]')) return;

  const fonts = [
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous'},
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Inter:wght@400;500;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap',
    },
  ];

  for (const font of fonts) {
    const link = document.createElement('link');
    link.rel = font.rel;
    link.href = font.href;
    if ('crossOrigin' in font && font.crossOrigin) link.crossOrigin = font.crossOrigin;
    link.dataset.installedAppFonts = '';
    document.head.append(link);
  }
}

async function main(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Failed to render app: element with id 'root' was not found.");
  }

  const returningAppEntry = resolveReturningAppEntry(new URL(window.location.href), prefersAppEntry());
  if (returningAppEntry) {
    window.history.replaceState(window.history.state, '', returningAppEntry);
  }

  const owner = classifyBrowserEntry(new URL(window.location.href), {
    VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  });
  if (owner === 'public') {
    const { renderPublicEntry } = await import('@/app/publicBootstrap.tsx');
    renderPublicEntry(rootElement);
    releaseBootLayerWhenReady(rootElement);
    return;
  }

  await migrateAstridBrowserStorage();
  loadInstalledAppTypography();

  const [
    { renderApp },
    { initializeVideoEditorExtensionRuntime },
    { initializeWorkspaceRuntimeIdentity },
  ] = await Promise.all([
    import('@/app/bootstrap'),
    import('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts'),
    import('@/integrations/runtime/client.ts'),
  ]);
  await Promise.all([
    initializeVideoEditorExtensionRuntime({ development: import.meta.env.DEV }),
    initializeWorkspaceRuntimeIdentity(),
  ]);
  renderApp(rootElement);
  releaseBootLayerWhenReady(rootElement);
}

void main();

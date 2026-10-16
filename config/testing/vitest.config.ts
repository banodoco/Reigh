import { defineConfig } from 'vitest/config';
import { createAstridComponentsPlugin } from '../vite/astridComponents';
import path from 'path';
import fs from 'fs';
import { resolveAstridSource, validateAstridToolCatalog } from '../vite/astridSource';

const projectRoot = path.resolve(__dirname, '../..');
const viteCacheDir = process.env.ASTRID_ENOSPC_VITE_CACHE_DIR?.trim();
function findDependencyRoot(startPath: string): string {
  let current = startPath;
  while (true) {
    const candidate = path.join(current, 'node_modules');
    if (fs.existsSync(path.join(candidate, 'react', 'package.json'))
      && fs.existsSync(path.join(candidate, '@vitejs', 'plugin-react-swc', 'refresh-runtime.js'))) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(projectRoot, 'node_modules');
}
const dependencyRoot = findDependencyRoot(projectRoot);
const astridSource = resolveAstridSource();
if (astridSource) validateAstridToolCatalog(astridSource.sourceRoot);
const astridPublicSource = resolveAstridSource(
  process.env.ASTRID_PUBLIC_CHECKOUT ?? '',
  'ASTRID_PUBLIC_CHECKOUT',
);
const timelineCompositionRegistryPath = path.join(
  dependencyRoot,
  '@banodoco/timeline-composition/typescript/src/registry.generated.ts',
);
const timelineCompositionThemeApiPath = path.join(
  dependencyRoot,
  '@banodoco/timeline-composition/typescript/src/theme-api.ts',
);

const resolvedTimelineCompositionRegistryPath = fs.existsSync(timelineCompositionRegistryPath)
  ? timelineCompositionRegistryPath
  : path.resolve(projectRoot, 'examples/embed-demo/stubs/timeline-composition/registry.generated.ts');

const resolvedTimelineCompositionThemeApiPath = fs.existsSync(timelineCompositionThemeApiPath)
  ? timelineCompositionThemeApiPath
  : path.resolve(projectRoot, 'examples/embed-demo/stubs/timeline-composition/theme-api.tsx');

export default defineConfig({
  root: projectRoot,
  plugins: astridSource ? [createAstridComponentsPlugin(astridSource.sourceRoot, process.env)] : [],
  ...(viteCacheDir ? { cacheDir: path.resolve(viteCacheDir) } : {}),
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@test-react-refresh': path.join(dependencyRoot, '@vitejs/plugin-react-swc/refresh-runtime.js'),
      '@reigh/editor-sdk': path.resolve(projectRoot, 'src/sdk/index.ts'),
      ...(astridSource ? { '@astrid': astridSource.sourceRoot } : {}),
      ...(astridPublicSource ? { '@astrid-public': astridPublicSource.sourceRoot } : {}),
      'fake-indexeddb': path.resolve(projectRoot, 'vendor/fake-indexeddb/index.js'),
      // Sprint 5: deduplicate react / remotion / @banodoco/* across linked
      // packages. The timeline-theme-2rp peer-dep package lives at a
      // file: link outside this app's node_modules tree; Vite's nearest-
      // node_modules resolution would otherwise pick up the package's
      // own copies (or fail when none exists). Pinning these to the
      // app's node_modules guarantees a single React/Remotion runtime.
      'react': path.join(dependencyRoot, 'react'),
      'react-dom': path.join(dependencyRoot, 'react-dom'),
      'remotion': path.join(dependencyRoot, 'remotion'),
      '@remotion/layout-utils': path.join(dependencyRoot, '@remotion/layout-utils'),
      '@remotion/media': path.join(dependencyRoot, '@remotion/media'),
      '@banodoco/timeline-composition/registry.generated': resolvedTimelineCompositionRegistryPath,
      '@banodoco/timeline-composition/theme-api': resolvedTimelineCompositionThemeApiPath,
      '@banodoco/timeline-composition': path.join(dependencyRoot, '@banodoco/timeline-composition'),
      '@banodoco/timeline-schema': path.resolve(projectRoot, 'src/test/shims/banodoco/timeline-schema.ts'),
      // Sprint 5: workspace-primitive aliases for the linked packages.
      // The composition package's animations.generated / transitions.generated
      // / effects.generated import via these aliases. Reigh's bundler needs
      // them to resolve; Banodoco's webpack already does the same.
      '@workspace-effects': path.resolve(projectRoot, 'vendor/banodoco-effects'),
      '@workspace-animations': path.resolve(projectRoot, 'vendor/banodoco-animations'),
      '@workspace-transitions': path.resolve(projectRoot, 'vendor/banodoco-transitions'),
    },
    dedupe: [
      'react',
      'react-dom',
      'remotion',
      '@remotion/layout-utils',
      '@banodoco/timeline-composition',
      '@banodoco/timeline-theme-2rp',
    ],
  },
  server: {
    fs: {
      // Allow Vite to read from sibling banodoco-workspace.
      allow: [
        path.resolve(projectRoot, '..', '..'),
        ...(astridSource ? [astridSource.checkout] : []),
        ...(astridPublicSource ? [astridPublicSource.checkout] : []),
      ],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'supabase/functions/**',
      // This suite imports Astrid's selected Remotion composition and has its
      // own config so its linked workspace aliases resolve to Astrid's pack.
      'src/tools/video-editor/runtime/astridSceneComposition.test.tsx',
    ],
    setupFiles: [
      path.resolve(projectRoot, 'src/test/reactRefreshSetup.ts'),
      path.resolve(projectRoot, 'src/test/setup.ts'),
    ],
  },
});

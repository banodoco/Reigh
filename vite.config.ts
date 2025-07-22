import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  // Define WebSocket target for real-time updates and task polling
  // The Express server only handles WebSocket connections now (no API routes)
  const defaultServerTarget = process.env.VITE_SERVER_TARGET_URL || 'http://127.0.0.1:8085';
  
  // For LAN access (mobile devices), we need to use the actual network IP
  const serverTarget = defaultServerTarget;
  const wsTarget = serverTarget.replace(/^http/, 'ws');
  
  console.log(`[Vite Config] Mode: ${mode}`);
  console.log(`[Vite Config] WebSocket Proxy Target: ${wsTarget}`);
  console.log(`[Vite Config] Server Health Check: ${serverTarget}/health`);
  console.log(`[Vite Config] For mobile access, ensure server is bound to 0.0.0.0:8085`);

  return {
    server: {
      host: "::", // Allows access from other devices on the network
      port: 2222,
      proxy: {
        // WebSocket proxy for real-time updates
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[Vite WebSocket Proxy] Error:', err.message);
              console.log('[Vite WebSocket Proxy] Tip: Ensure server is running on 0.0.0.0:8085');
            });
          },
        },
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
      fs: {
        allow: ['..'],
      },
      strictPort: true,
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  // Define API target based on mode or environment variables
  // For local development, target the local API server (port 8085 by default)
  // Support both localhost and LAN access for mobile devices
  const defaultApiTarget = process.env.VITE_API_TARGET_URL || 'http://127.0.0.1:8085';
  
  // For LAN access (mobile devices), we need to use the actual network IP
  // The API server should be started with --host 0.0.0.0 or bound to the network interface
  const apiTarget = defaultApiTarget;
  const wsTarget = apiTarget.replace(/^http/, 'ws');
  
  console.log(`[Vite Config] Mode: ${mode}`);
  console.log(`[Vite Config] API Proxy Target: ${apiTarget}/api`);
  console.log(`[Vite Config] WebSocket Proxy Target: ${wsTarget}`);
  console.log(`[Vite Config] For mobile access, ensure API server is bound to 0.0.0.0:8085`);

  return {
    server: {
      host: "::", // Allows access from other devices on the network
      port: 2222,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          // Add mobile-friendly proxy settings
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[Vite Proxy] Error:', err.message);
              console.log('[Vite Proxy] Tip: For mobile access, ensure your API server is running on 0.0.0.0:8085');
            });
          },
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  // Define API target based on mode or environment variables
  // For local development, target the local API server (port 3001 by default)
  // For other environments (like Runpod), you might use an environment variable
  // e.g., VITE_API_TARGET_URL=http://213.173.108.33:13296
  const apiTarget = process.env.VITE_API_TARGET_URL || 'http://127.0.0.1:8085';
  const wsTarget = apiTarget.replace(/^http/, 'ws');
  
  console.log(`[Vite Config] Mode: ${mode}`);
  console.log(`[Vite Config] API Proxy Target: ${apiTarget}/api`);
  console.log(`[Vite Config] WebSocket Proxy Target: ${wsTarget}`);

  return {
    server: {
      host: "::",
      port: 2222,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
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

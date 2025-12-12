import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  console.log(`[Vite Config] Mode: ${mode}`);
  console.log(`[Vite Config] No server proxy needed - using direct Supabase connections`);

  const port = process.env.PORT ? parseInt(process.env.PORT) : 2222;

  return {
    server: {
      host: "::", // Allows access from other devices on the network
      port: port,
    },
    preview: {
      host: "0.0.0.0",
      port: port,
      allowedHosts: [
        "healthcheck.railway.app", 
        "reigh-production.up.railway.app",
        "reigh.art",
        "www.reigh.art"
      ],
    },
    plugins: [
      react(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
  };
});

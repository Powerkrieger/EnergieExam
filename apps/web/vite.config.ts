import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Copies pdf.js decoders (JPEG 2000, JBIG2), colour profiles, CMaps and fonts into public/pdfjs. */
function pdfjsAssets(): Plugin {
  return {
    name: "pdfjs-assets",
    configResolved(config) {
      const pkg = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
      for (const dir of ["wasm", "iccs", "cmaps", "standard_fonts"]) {
        cpSync(join(pkg, dir), join(config.publicDir, "pdfjs", dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  // Relative paths so the build also works inside the Android/iOS WebView.
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 3000 },
  server: { host: true },
});

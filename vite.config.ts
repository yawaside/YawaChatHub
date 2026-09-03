import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Сборка рендерера для Electron (desktop/renderer-dist): `npm run build:renderer` → dist/index.html
// Сайт собирается Next.js (`npm run build`), оба используют одни и те же src/components и src/lib.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Корневой postcss.config.mjs принадлежит Next.js (@tailwindcss/postcss);
  // здесь Tailwind подключён Vite-плагином, поэтому PostCSS-конфиг отключаем.
  css: { postcss: { plugins: [] } },
  define: {
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(
      process.env.VITE_APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION ?? ""
    ),
  },
});

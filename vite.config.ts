import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
 * The demo flag comes from the build mode rather than from a .env file. Env files are
 * excluded from version control here on purpose, so one carrying this flag would be missing
 * exactly where it is needed - on the machine that builds the published page - and the
 * failure would be a demo that loads and then asks a server that is not there.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_DEMO": JSON.stringify(mode === "demo" ? "1" : "0"),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/story-board/",
  build: {
    outDir: "../story-board",
    emptyOutDir: true,
  },
  server: {
    fs: { allow: [".."] },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/plot-studio/",
  build: {
    outDir: "../plot-studio-dist",
    emptyOutDir: true,
  },
});

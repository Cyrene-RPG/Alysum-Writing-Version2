import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/plot-doctor/",
  build: {
    outDir: "../plot-doctor",
    emptyOutDir: true,
  },
  server: {
    fs: { allow: [".."] },
  },
});

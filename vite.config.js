import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "app.html"),
        diff: resolve(__dirname, "diff.html"),
        docs: resolve(__dirname, "docs.html"),
        audit: resolve(__dirname, "audit.html"),
        insights: resolve(__dirname, "insights.html"),
        methodology: resolve(__dirname, "methodology.html"),
      },
    },
  },
});

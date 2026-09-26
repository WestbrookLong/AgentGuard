import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const dependency = (name: string) => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: /^react$/, replacement: dependency("react") },
    { find: /^react\/jsx-runtime$/, replacement: dependency("react/jsx-runtime.js") },
    { find: /^lucide-react$/, replacement: dependency("lucide-react") },
    { find: /^cytoscape$/, replacement: dependency("cytoscape") },
  ] },
  server: { fs: { allow: [".."] } },
});

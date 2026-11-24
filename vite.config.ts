import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      entryRoot: "src",
      include: ["src"],
      outDirs: "dist/types",
      tsconfigPath: "./tsconfig.json",
    }),
  ],
  build: {
    sourcemap: true,
    lib: {
      entry: {
        "leaflet-polyline-history": resolve(
          fileURLToPath(new URL(".", import.meta.url)),
          "src/index.ts",
        ),
        react: resolve(
          fileURLToPath(new URL(".", import.meta.url)),
          "src/react/index.ts",
        ),
      },
      name: "LeafletPolylineHistory",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["leaflet", /^leaflet\//, "react", "react-leaflet"],
    },
  },
});

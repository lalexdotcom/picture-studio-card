import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: {
    entry: { "picture-badges": "./src/index.ts" },
  },
  lib: [
    {
      format: "esm",
      bundle: true,
      autoExternal: false,
      syntax: "es2022",
      dts: false,
    },
  ],
  output: {
    target: "web",
    distPath: { root: "dist" },
    cleanDistPath: false,
  },
});

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  tsconfig: "./tsconfig.build.json",

  platform: "neutral",
  target: "es2022",

  dts: true,
  sourcemap: false,
  minify: true,
  clean: true,

  deps: {
    neverBundle: ["zod"],
  },
});

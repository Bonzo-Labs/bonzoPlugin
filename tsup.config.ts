import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["./src/plugin.ts"],
    outDir: "dist",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external: ["@hashgraph/sdk", "hedera-agent-kit"],
    outExtension({ format }) {
      return {
        js: format === "cjs" ? ".cjs" : ".js",
      };
    },
  },
]);

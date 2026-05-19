import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["./src/plugin.ts"],
    outDir: "dist",
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external: [
      "@hiero-ledger/sdk",
      "@hashgraph/hedera-agent-kit",
      "@hashgraph/hedera-agent-kit/langchain",
      "@hashgraph/hedera-agent-kit-langchain",
    ],
    outExtension({ format }) {
      return {
        js: format === "cjs" ? ".cjs" : ".js",
      };
    },
  },
]);

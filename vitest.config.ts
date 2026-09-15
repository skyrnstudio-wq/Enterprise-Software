import { mergeConfig, defineConfig as defineViteConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default mergeConfig(
  defineViteConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
  defineViteConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        include: ["src/lib/**/*.ts", "src/domain/**/*.ts"],
      },
    },
  }),
);

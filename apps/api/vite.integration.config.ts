import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
})

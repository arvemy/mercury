import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 60_000,
  },
})

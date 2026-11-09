import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "siyuan": resolve(__dirname, "tests/mocks/siyuan.ts")
        }
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"]
    }
});

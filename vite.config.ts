import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCloudConfig } from "./cloud-config";
export default defineConfig(({ mode }) => {
  const values = {
    ...loadEnv(mode, process.cwd(), "VITE_"),
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ),
  } as Record<string, string>;
  const origin = validateCloudConfig(values);
  return {
    plugins: [
      react(),
      {
        name: "supabase-connect-policy",
        apply: "build" as const,
        async closeBundle() {
          if (origin) {
            const path = resolve("dist/_headers");
            let headers = await readFile(path, "utf8");
            headers = headers.replace(
              "connect-src 'self';",
              `connect-src 'self' ${origin};`,
            );
            await writeFile(path, headers);
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: origin
            ? (id: string) =>
                id.includes("/node_modules/@supabase/") ? "supabase" : undefined
            : undefined,
        },
      },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});

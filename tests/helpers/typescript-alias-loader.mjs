import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers" || specifier === "next/navigation") {
    return nextResolve(`${specifier}.js`, context);
  }

  if (specifier.startsWith("@/")) {
    const base = new URL(`../../${specifier.slice(2)}`, import.meta.url);
    const candidates = [
      base,
      new URL(`${base.href}.ts`),
      new URL(`${base.href}.tsx`),
      new URL(`${base.href}.js`),
      new URL(`${base.href}.mjs`),
      new URL(`${base.href}/index.ts`),
      new URL(`${base.href}/index.tsx`),
    ];
    const resolved = candidates.find((candidate) =>
      existsSync(fileURLToPath(candidate)),
    );

    if (resolved) return { shortCircuit: true, url: resolved.href };
  }

  return nextResolve(specifier, context);
}

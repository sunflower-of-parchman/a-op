import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

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

  return resolved
    ? { shortCircuit: true, url: resolved.href }
    : nextResolve(specifier, context);
}

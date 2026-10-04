import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 拡張子の無い相対 import を .ts / .tsx / index.ts に解決する。 */
const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-z0-9]+$/i.test(specifier);

  if (isRelative && !hasExtension && context.parentURL) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        // format は返さない。Node に .ts と判定させ、型除去を効かせるため。
        return { url: candidate.href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}

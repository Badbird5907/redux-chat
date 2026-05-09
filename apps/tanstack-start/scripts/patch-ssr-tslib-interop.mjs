import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const serverOutputDir = join(appDir, ".output", "server");
const brokenTslibDefaultInterop = "})))())).default;";
const fixedTslibInterop = "})))()));";

let patchedFiles = 0;

function patchServerFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const filePath = join(dir, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      patchServerFiles(filePath);
      continue;
    }

    if (!entry.endsWith(".mjs")) {
      continue;
    }

    const code = readFileSync(filePath, "utf8");

    if (
      !code.includes('define("tslib"') ||
      !code.includes(brokenTslibDefaultInterop)
    ) {
      continue;
    }

    const fixedCode = code.replaceAll(
      brokenTslibDefaultInterop,
      fixedTslibInterop,
    );

    writeFileSync(filePath, fixedCode);
    patchedFiles += 1;
  }
}

if (!existsSync(serverOutputDir)) {
  throw new Error(`SSR output directory does not exist: ${serverOutputDir}`);
}

patchServerFiles(serverOutputDir);

if (patchedFiles > 0) {
  console.log(`Patched tslib SSR interop in ${patchedFiles} file(s).`);
} else {
  console.log("No tslib SSR interop patch needed.");
}

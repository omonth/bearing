import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const args = new Map();

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const url = args.get("url") || "http://localhost:3000";
const outDir = args.get("out-dir") || "logs/perf";
const tag = args.get("tag") || new Date().toISOString().replace(/[:.]/g, "-");
const lighthouseVersion = args.get("lighthouse-version") || "12.6.1";
const absoluteOutDir = path.resolve(root, outDir);

mkdirSync(absoluteOutDir, { recursive: true });

function collectFiles(dir, predicate) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function bundleStats() {
  const staticDir = path.join(root, ".next", "static");
  const files = collectFiles(staticDir, (file) => /\.(js|css)$/.test(file));
  const totals = {
    jsBytes: 0,
    cssBytes: 0,
    jsGzipBytes: 0,
    cssGzipBytes: 0,
    fileCount: files.length,
  };

  for (const file of files) {
    const bytes = statSync(file).size;
    const gzipBytes = gzipSync(readFileSync(file)).length;
    if (file.endsWith(".js")) {
      totals.jsBytes += bytes;
      totals.jsGzipBytes += gzipBytes;
    } else if (file.endsWith(".css")) {
      totals.cssBytes += bytes;
      totals.cssGzipBytes += gzipBytes;
    }
  }

  return totals;
}

function runLighthouse(preset) {
  const outputPath = path.join(absoluteOutDir, `${tag}-${preset}.json`);
  const lighthouseArgs = [
    "-y",
    `lighthouse@${lighthouseVersion}`,
    url,
    "--quiet",
    "--output=json",
    `--output-path=${outputPath}`,
    "--only-categories=performance",
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
  ];

  if (preset === "desktop") {
    lighthouseArgs.push("--preset=desktop");
  }

  const result = spawnSync("npx", lighthouseArgs, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 1024 * 1024 * 16,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Lighthouse ${preset} failed with status ${result.status}.`,
        result.error ? `error: ${result.error.message}` : "",
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const audits = report.audits;
  const networkItems = audits["network-requests"]?.details?.items || [];
  const transferBytes = networkItems.reduce(
    (sum, item) => sum + (Number(item.transferSize) || 0),
    0
  );

  return {
    outputPath,
    performanceScore: Math.round((report.categories.performance.score || 0) * 100),
    lcpMs: Math.round(audits["largest-contentful-paint"]?.numericValue || 0),
    fcpMs: Math.round(audits["first-contentful-paint"]?.numericValue || 0),
    cls: Number((audits["cumulative-layout-shift"]?.numericValue || 0).toFixed(4)),
    speedIndexMs: Math.round(audits["speed-index"]?.numericValue || 0),
    totalBlockingTimeMs: Math.round(audits["total-blocking-time"]?.numericValue || 0),
    requests: networkItems.length,
    transferKb: Math.round(transferBytes / 102.4) / 10,
  };
}

function kb(bytes) {
  return Math.round(bytes / 102.4) / 10;
}

const startedAt = new Date().toISOString();
const mobile = runLighthouse("mobile");
const desktop = runLighthouse("desktop");
const bundles = bundleStats();

const summary = {
  tag,
  url,
  startedAt,
  mobile,
  desktop,
  bundles: {
    jsKb: kb(bundles.jsBytes),
    cssKb: kb(bundles.cssBytes),
    jsGzipKb: kb(bundles.jsGzipBytes),
    cssGzipKb: kb(bundles.cssGzipBytes),
    fileCount: bundles.fileCount,
  },
};

console.log(JSON.stringify(summary, null, 2));

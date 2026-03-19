#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = resolve(__dirname, '..');

export const SOURCE_EXTENSIONS = new Set(['.mjs', '.js', '.html', '.css']);
export const IGNORED_PATH_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  'storage',
  'tmp',
  '.wrangler',
]);
export const IGNORED_PATHS = new Set([
  'package-lock.json',
  'static/marked.min.js',
]);

export const DEFAULT_WARN_LINE_LIMITS = {
  '.mjs': 800,
  '.js': 800,
  '.html': 600,
  '.css': 700,
};

export const DEFAULT_FAIL_LINE_LIMITS = {
  '.mjs': 1200,
  '.js': 1200,
  '.html': 900,
  '.css': 1000,
};

function normalizeRelativePath(pathname) {
  return String(pathname || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function shouldIgnorePath(pathname) {
  const normalized = normalizeRelativePath(pathname);
  if (!normalized) return true;
  if (IGNORED_PATHS.has(normalized)) return true;
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => segment.startsWith('.') || IGNORED_PATH_SEGMENTS.has(segment));
}

function isCandidateSourceFile(pathname) {
  const normalized = normalizeRelativePath(pathname);
  if (shouldIgnorePath(normalized)) return false;
  return SOURCE_EXTENSIONS.has(extname(normalized).toLowerCase());
}

function countLines(text) {
  if (!text) return 0;
  return String(text).split(/\r\n|\r|\n/).length;
}

function listFilesFallback(rootDir, currentDir = rootDir, files = []) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = join(currentDir, entry.name);
    const relativePath = normalizeRelativePath(relative(rootDir, absolutePath));
    if (entry.isDirectory()) {
      if (shouldIgnorePath(relativePath)) continue;
      listFilesFallback(rootDir, absolutePath, files);
      continue;
    }
    if (entry.isFile() && isCandidateSourceFile(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

export function listCandidateFiles(rootDir = defaultRootDir) {
  const resolvedRoot = resolve(rootDir);
  try {
    const stdout = execFileSync('git', ['ls-files', '-z'], {
      cwd: resolvedRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return stdout
      .split('\0')
      .map((value) => normalizeRelativePath(value))
      .filter(Boolean)
      .filter(isCandidateSourceFile)
      .sort();
  } catch {
    return listFilesFallback(resolvedRoot).sort();
  }
}

function resolveLineLimit(limits, extension, fallback) {
  const specificLimit = limits?.[extension];
  if (Number.isInteger(specificLimit) && specificLimit > 0) {
    return specificLimit;
  }
  return fallback;
}

export function scanOversizedFiles(rootDir = defaultRootDir, {
  warnLineLimits = DEFAULT_WARN_LINE_LIMITS,
  failLineLimits = DEFAULT_FAIL_LINE_LIMITS,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const files = listCandidateFiles(resolvedRoot);
  const oversizedFiles = [];

  for (const relativePath of files) {
    const extension = extname(relativePath).toLowerCase();
    const warnLimit = resolveLineLimit(warnLineLimits, extension, 800);
    const failLimit = Math.max(
      resolveLineLimit(failLineLimits, extension, warnLimit),
      warnLimit,
    );
    const absolutePath = join(resolvedRoot, relativePath);
    const stat = statSync(absolutePath);
    const text = readFileSync(absolutePath, 'utf8');
    const lines = countLines(text);
    if (lines < warnLimit) continue;
    oversizedFiles.push({
      path: relativePath,
      extension,
      lines,
      bytes: stat.size,
      warnLimit,
      failLimit,
      severity: lines >= failLimit ? 'fail' : 'warn',
    });
  }

  oversizedFiles.sort((left, right) => {
    const severityRank = { fail: 0, warn: 1 };
    return severityRank[left.severity] - severityRank[right.severity]
      || right.lines - left.lines
      || left.path.localeCompare(right.path);
  });

  return {
    rootDir: resolvedRoot,
    scannedFileCount: files.length,
    oversizedFiles,
    warningCount: oversizedFiles.filter((entry) => entry.severity === 'warn').length,
    failCount: oversizedFiles.filter((entry) => entry.severity === 'fail').length,
  };
}

export function formatOversizedFilesReport(report, {
  githubActions = false,
} = {}) {
  const oversizedFiles = Array.isArray(report?.oversizedFiles) ? report.oversizedFiles : [];
  if (oversizedFiles.length === 0) {
    return {
      text: `Oversized source file report: none found across ${report?.scannedFileCount || 0} files.`,
      annotations: [],
    };
  }

  const summaryLine = [
    `Oversized source file report: ${oversizedFiles.length} file(s) flagged`,
    `across ${report?.scannedFileCount || 0} scanned file(s)`,
    `(${report?.failCount || 0} at or above fail threshold).`,
  ].join(' ');

  const detailLines = oversizedFiles.map((entry) => [
    entry.severity === 'fail' ? '!' : '-',
    `${entry.path}`,
    `${entry.lines} lines`,
    `(warn ${entry.warnLimit}, fail ${entry.failLimit})`,
  ].join(' '));

  const annotations = githubActions
    ? oversizedFiles.map((entry) => `::warning file=${entry.path}::Oversized source file (${entry.lines} lines; warn ${entry.warnLimit}, fail ${entry.failLimit})`)
    : [];

  return {
    text: [summaryLine, ...detailLines].join('\n'),
    annotations,
  };
}

function parseArgs(argv = []) {
  const options = {
    rootDir: defaultRootDir,
    failOnOversizedFiles: process.env.FILESIZE_FAIL === '1',
    githubActions: process.env.GITHUB_ACTIONS === 'true',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.rootDir = resolve(argv[index + 1] || defaultRootDir);
      index += 1;
      continue;
    }
    if (arg === '--fail') {
      options.failOnOversizedFiles = true;
      continue;
    }
    if (arg === '--github-actions') {
      options.githubActions = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/report-oversized-files.mjs [--root <dir>] [--fail] [--github-actions]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = scanOversizedFiles(options.rootDir);
  const formatted = formatOversizedFilesReport(report, {
    githubActions: options.githubActions,
  });

  for (const annotation of formatted.annotations) {
    console.log(annotation);
  }
  console.log(formatted.text);

  if (options.failOnOversizedFiles && report.failCount > 0) {
    process.exitCode = 1;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(`report-oversized-files: ${error.message}`);
    process.exitCode = 1;
  });
}

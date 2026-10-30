// Lightweight repository secret check. Scans git-tracked files (or the working tree if git is unavailable).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report', 'coverage', '.wrangler']);
const SKIP_FILES = new Set(['package-lock.json']);
const BINARY = /\.(pdf|png|jpe?g|gif|webp|ico|zip|woff2?)$/i;
const PLACEHOLDER = /(change-?me|replace-?me|ci-only|placeholder|example|your-|<[^>]*>|\$\{|process\.env)/i;

const PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})/],
  ['API key (sk-…)', /\bsk-[A-Za-z0-9]{32,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
];
const ASSIGNMENT = /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*["']?([^\s"'#]{12,})/;
// Test fixtures (tests/, e2e/) use fake values on purpose; the assignment rule skips them, other rules do not.
const FIXTURE_DIR = /(^|\/)(tests?|e2e)\//;
const DB_URL = /postgres(?:ql)?:\/\/[^:\s/]+:([^@\s]{4,})@/;

function listFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    const out = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); }
        else out.push(path.join(dir, e.name));
      }
    })('.');
    return out.map((f) => f.replaceAll('\\', '/').replace(/^\.\//, ''));
  }
}

const findings = [];
for (const file of listFiles()) {
  const base = path.basename(file);
  if (SKIP_FILES.has(base) || BINARY.test(file) || file.split('/').some((p) => SKIP_DIRS.has(p))) continue;
  if (/^\.env/.test(base) && base !== '.env.example') findings.push(`${file}: environment file must not be committed`);
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [label, re] of PATTERNS) if (re.test(line)) findings.push(`${file}:${i + 1}: possible ${label}`);
    const a = line.match(ASSIGNMENT);
    if (a && !FIXTURE_DIR.test(file) && !a[1].includes('(') && !PLACEHOLDER.test(a[1])) findings.push(`${file}:${i + 1}: hard-coded secret-looking value`);
    const d = line.match(DB_URL);
    if (d && !PLACEHOLDER.test(d[1])) findings.push(`${file}:${i + 1}: database URL with a real-looking password`);
  });
}

if (findings.length) {
  console.error(`Secret check failed (${findings.length}):\n` + findings.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Secret check passed: no secrets found in tracked files.');

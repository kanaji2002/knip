import { readFile } from 'node:fs/promises';
import { dirname } from './path.ts';

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const REQUIRE_RE = /\brequire(?:\.resolve)?\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const FROM_RE = /\bfrom\s+(['"])([^'"]+)\1/g;
const SIDE_EFFECT_RE = /\bimport\s+(['"])([^'"]+)\1/g;
const DYNAMIC_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const PATTERNS = [REQUIRE_RE, FROM_RE, SIDE_EFFECT_RE, DYNAMIC_RE] as const;

function* extractSpecifiers(line: string): Generator<string> {
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) yield m[2];
  }
}

function matchesPackage(specifier: string, pkg: string) {
  return specifier === pkg || specifier.startsWith(`${pkg}/`);
}

async function findPackagesInFiles(packages: Set<string>, filePaths: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const filePath of filePaths) {
    if (found.size === packages.size) break;
    let content: string;
    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const stripped = content.replace(BLOCK_COMMENT_RE, '');
    for (const line of stripped.split('\n')) {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('#')) continue;
      for (const specifier of extractSpecifiers(line)) {
        for (const pkg of packages) {
          if (!found.has(pkg) && matchesPackage(specifier, pkg)) found.add(pkg);
        }
      }
    }
  }
  return found;
}

type IssueRef = { filePath: string; symbol: string };

export async function getSourceReferencedPackages(
  issues: IssueRef[],
  analyzedFiles: Set<string>
): Promise<(issue: IssueRef) => boolean> {
  if (issues.length === 0) return () => false;

  const packagesByDir = new Map<string, Set<string>>();
  for (const { filePath, symbol } of issues) {
    const dir = dirname(filePath);
    let set = packagesByDir.get(dir);
    if (!set) {
      set = new Set();
      packagesByDir.set(dir, set);
    }
    set.add(symbol);
  }

  const allFiles = [...analyzedFiles];
  const foundByDir = new Map<string, Set<string>>();
  for (const [dir, packages] of packagesByDir) {
    const scopedFiles = allFiles.filter(f => f.startsWith(`${dir}/`));
    foundByDir.set(dir, await findPackagesInFiles(packages, scopedFiles));
  }

  return ({ filePath, symbol }) => foundByDir.get(dirname(filePath))?.has(symbol) ?? false;
}

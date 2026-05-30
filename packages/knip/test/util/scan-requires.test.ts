import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getSourceReferencedPackages } from '../../src/util/scan-requires.ts';

const dir = await mkdtemp(join(tmpdir(), 'knip-scan-requires-'));
const pkgJson = join(dir, 'package.json');
const srcFile = join(dir, 'index.js');

const check = async (content: string, pkg: string): Promise<boolean> => {
  await writeFile(srcFile, content, 'utf8');
  const pred = await getSourceReferencedPackages([{ filePath: pkgJson, symbol: pkg }], new Set([srcFile]));
  return pred({ filePath: pkgJson, symbol: pkg });
};

test.after(async () => rm(dir, { recursive: true }));

// --- Patterns that SHOULD be detected ---

test("require single quote", async () => assert.ok(await check("const _ = require('lodash')", 'lodash')));
test("require double quote", async () => assert.ok(await check('const _ = require("lodash")', 'lodash')));
test("require subpath", async () => assert.ok(await check("const m = require('lodash/merge')", 'lodash')));
test("require destructured", async () => assert.ok(await check("const { map } = require('lodash')", 'lodash')));
test("require.resolve", async () => assert.ok(await check("require.resolve('lodash')", 'lodash')));
test("import default", async () => assert.ok(await check("import _ from 'lodash'", 'lodash')));
test("import side effect", async () => assert.ok(await check("import 'lodash'", 'lodash')));
test("import named", async () => assert.ok(await check("import { map } from 'lodash'", 'lodash')));
test("import namespace", async () => assert.ok(await check("import * as _ from 'lodash'", 'lodash')));
test("import subpath", async () => assert.ok(await check("import merge from 'lodash/merge'", 'lodash')));
test("dynamic import", async () => assert.ok(await check("const m = await import('lodash')", 'lodash')));

// --- Patterns that should NOT be detected ---

test("line comment //", async () => assert.ok(!await check("// const _ = require('lodash')", 'lodash')));
test("line comment #", async () => assert.ok(!await check("# require('lodash')", 'lodash')));
test("block comment", async () => assert.ok(!await check("/* require('lodash') */", 'lodash')));
test("block comment multiline", async () => assert.ok(!await check("/*\nimport _ from 'lodash'\n*/", 'lodash')));
test("unrelated string", async () => assert.ok(!await check("const msg = 'please install lodash'", 'lodash')));
test("array literal", async () => assert.ok(!await check("const arr = ['lodash', 'axios']", 'lodash')));
test("prefix match should not fire", async () => assert.ok(!await check("require('lodash-reporter')", 'lodash')));
test("wrong package", async () => assert.ok(!await check("require('lodash')", 'axios')));

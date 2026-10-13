import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = await mkdtemp(join(tmpdir(), 'ecology-checks-'));
try {
  const checks = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).sort();
  for (const name of checks) {
    const output = join(directory, name.replace(/\.ts$/, '.mjs'));
    await build({ entryPoints: [join('tests', name)], bundle: true, platform: 'node', format: 'esm', outfile: output });
    await import(pathToFileURL(output).href);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

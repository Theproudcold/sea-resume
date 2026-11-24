import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readAppVersion } from '../appVersion';

const dirs: string[] = [];

const manifestDir = (content: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'sea-resume-version-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), content);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readAppVersion', () => {
  it('reads the version the release tag is checked against', () => {
    expect(readAppVersion(manifestDir(JSON.stringify({ version: '1.2.3' })))).toBe('1.2.3');
  });

  it('fails the build instead of showing an empty version when package.json has none', () => {
    expect(() => readAppVersion(manifestDir(JSON.stringify({ name: 'sea-resume' })))).toThrow('version');
  });
});

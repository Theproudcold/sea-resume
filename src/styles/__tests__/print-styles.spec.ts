import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.scss'), 'utf8');

describe('resume print stylesheet', () => {
  it('targets the live resume canvas and uses A4 while hiding app controls', () => {
    expect(stylesheet).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/i);
    expect(stylesheet).toContain('.resume-canvas,');
    expect(stylesheet).toContain('.no-print,');
    expect(stylesheet).toContain('visibility: hidden;');
    expect(stylesheet).toContain('visibility: visible;');
    expect(stylesheet).not.toContain('#resume-canvas');
    expect(stylesheet).toContain('.editor-container .mobile-hidden:not(.no-print)');
  });

  it('allows document flow across pages and avoids splitting individual resume entries', () => {
    expect(stylesheet).toContain('height: auto !important;');
    expect(stylesheet).toContain('overflow: visible !important;');
    expect(stylesheet).toContain('.resume-canvas .section');
    expect(stylesheet).toContain('break-inside: auto !important;');
    expect(stylesheet).toContain('.resume-canvas .experience-item');
    expect(stylesheet).toContain('break-inside: avoid-page;');
  });
});

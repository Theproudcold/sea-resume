import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusQualityTarget, isHidden, waitForElement } from '@/utils/focusQualityTarget';

const mountRoot = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};

/** jsdom has no layout, so scrollIntoView is missing and observing a specific element keeps the assertions exact. */
const spyScroll = (element: Element) => {
  const spy = vi.fn();
  element.scrollIntoView = spy;
  return spy;
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('focusQualityTarget', () => {
  it('scrolls to the section root when there is no field target', async () => {
    const root = mountRoot('<section></section>');
    const rootScroll = spyScroll(root);

    await focusQualityTarget(root, null);

    expect(rootScroll).toHaveBeenCalledTimes(1);
  });

  it('scrolls to a visible field and focuses its input', async () => {
    const root = mountRoot(`
      <section>
        <div data-quality-id="experience-company-e"><input id="company" /></div>
      </section>
    `);
    const field = root.querySelector('[data-quality-id="experience-company-e"]')!;
    const rootScroll = spyScroll(root);
    const fieldScroll = spyScroll(field);

    await focusQualityTarget(root, 'experience-company-e');

    expect(fieldScroll).toHaveBeenCalledTimes(1);
    expect(rootScroll).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('company');
  });

  it('expands a collapsed entry card before scrolling to its field', async () => {
    const root = mountRoot(`
      <section>
        <div class="resume-entry-card">
          <div class="resume-entry-card__header"><button aria-expanded="false">expand</button></div>
          <div id="body" style="display: none"><div data-quality-id="experience-position-e"><input id="position" /></div></div>
        </div>
      </section>
    `);
    const body = root.querySelector<HTMLElement>('#body')!;
    const toggle = root.querySelector('button')!;
    toggle.addEventListener('click', () => {
      body.style.display = '';
      toggle.setAttribute('aria-expanded', 'true');
    });
    const rootScroll = spyScroll(root);

    await focusQualityTarget(root, 'experience-position-e');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(rootScroll).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('position');
  });

  it('falls back to the section root when the field stays unreachable', async () => {
    const root = mountRoot(`
      <section>
        <div class="resume-entry-card">
          <div id="body" style="display: none"><div data-quality-id="project-name-p"><input id="name" /></div></div>
        </div>
      </section>
    `);
    const rootScroll = spyScroll(root);

    await focusQualityTarget(root, 'project-name-p');

    expect(rootScroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).not.toBe('name');
  });

  it('falls back to the section root for an anchor that does not exist', async () => {
    const root = mountRoot('<section></section>');
    const rootScroll = spyScroll(root);

    await focusQualityTarget(root, 'education-school-missing');

    expect(rootScroll).toHaveBeenCalledTimes(1);
  });

  it('handles anchors that contain quotes', async () => {
    const root = mountRoot('<section></section>');
    const field = document.createElement('div');
    field.setAttribute('data-quality-id', 'experience-company-a"b');
    field.innerHTML = '<input id="quoted" />';
    root.appendChild(field);
    const fieldScroll = spyScroll(field);

    await focusQualityTarget(root, 'experience-company-a"b');

    expect(fieldScroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe('quoted');
  });
});

describe('isHidden', () => {
  it('detects a field inside a display:none ancestor and the hidden attribute', () => {
    const root = mountRoot(`
      <section>
        <div style="display: none"><div data-quality-id="a"></div></div>
        <div hidden><div data-quality-id="b"></div></div>
        <div data-quality-id="c"></div>
      </section>
    `);
    expect(isHidden(root.querySelector('[data-quality-id="a"]')!)).toBe(true);
    expect(isHidden(root.querySelector('[data-quality-id="b"]')!)).toBe(true);
    expect(isHidden(root.querySelector('[data-quality-id="c"]')!)).toBe(false);
  });
});

describe('waitForElement', () => {
  it('resolves as soon as the element appears', async () => {
    let element: HTMLElement | null = null;
    setTimeout(() => { element = document.createElement('div'); }, 0);
    await expect(waitForElement(() => element, { timeoutMs: 200 })).resolves.toBeInstanceOf(HTMLElement);
  });

  it('stops when the caller cancels', async () => {
    await expect(waitForElement(() => null, { timeoutMs: 5000, isCancelled: () => true })).resolves.toBeNull();
  });

  it('gives up once the deadline passes', async () => {
    await expect(waitForElement(() => null, { timeoutMs: 0 })).resolves.toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { isTypingTarget, isChordFollowUp, isActivatableTarget, CHORD_WINDOW_MS } from './keyboard';

describe('isTypingTarget', () => {
  it('is true for input, textarea and select', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true for a contenteditable element', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isTypingTarget(div)).toBe(true);
    div.setAttribute('contenteditable', '');
    expect(isTypingTarget(div)).toBe(true);
  });

  it('is false for other elements and for no element', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    const off = document.createElement('div');
    off.setAttribute('contenteditable', 'false');
    expect(isTypingTarget(off)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe('isChordFollowUp', () => {
  it('is true for a key pressed soon after G', () => {
    expect(isChordFollowUp(10_000, 10_000 + 50)).toBe(true);
    expect(isChordFollowUp(10_000, 10_000 + CHORD_WINDOW_MS - 1)).toBe(true);
  });

  it('is false once the chord window has passed', () => {
    expect(isChordFollowUp(10_000, 10_000 + CHORD_WINDOW_MS)).toBe(false);
    expect(isChordFollowUp(10_000, 60_000)).toBe(false);
  });

  it('is false when G was never pressed', () => {
    expect(isChordFollowUp(0, 5)).toBe(false);
  });
});

describe('isActivatableTarget', () => {
  it('is true for a button, a link, a menu item and anything inside one', () => {
    const button = document.createElement('button');
    button.innerHTML = '<span>Filters</span>';
    expect(isActivatableTarget(button)).toBe(true);
    expect(isActivatableTarget(button.firstElementChild)).toBe(true);
    const link = document.createElement('a');
    link.setAttribute('href', '#x');
    expect(isActivatableTarget(link)).toBe(true);
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    expect(isActivatableTarget(item)).toBe(true);
  });

  it('is false for the page body, a plain div and nothing', () => {
    expect(isActivatableTarget(document.body)).toBe(false);
    expect(isActivatableTarget(document.createElement('div'))).toBe(false);
    expect(isActivatableTarget(null)).toBe(false);
    expect(isActivatableTarget(undefined)).toBe(false);
  });
});

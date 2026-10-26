import { beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  getTerminalFontSize,
  onTerminalFontSizeChange,
  setTerminalFontSize,
} from './terminalFontSize';

beforeEach(() => {
  localStorage.clear();
});

it('defaults when unset and clamps stored values', () => {
  expect(getTerminalFontSize()).toBe(DEFAULT_TERMINAL_FONT_SIZE);
  localStorage.setItem('vela_terminal_font_size', '99');
  expect(getTerminalFontSize()).toBe(24);
  localStorage.setItem('vela_terminal_font_size', '2');
  expect(getTerminalFontSize()).toBe(9);
});

it('persists the clamped size and notifies listeners', () => {
  const handler = vi.fn();
  const off = onTerminalFontSizeChange(handler);
  expect(setTerminalFontSize(15)).toBe(15);
  expect(localStorage.getItem('vela_terminal_font_size')).toBe('15');
  expect(handler).toHaveBeenCalledWith(15);
  off();
  setTerminalFontSize(16);
  expect(handler).toHaveBeenCalledTimes(1);
});

import React, { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { session } from '../../test/helpers';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';

vi.mock('./XTermView', () => ({
  XTermView: ({ sessionId, isActive, isVisible }: { sessionId: string; isActive: boolean; isVisible?: boolean }) => (
    <div data-testid={`xterm-${sessionId}`} data-active={String(isActive)} data-visible={String(Boolean(isVisible))} />
  ),
}));

import { TerminalGrid } from './TerminalGrid';

beforeEach(() => {
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
});

it('keeps inactive terminal panes laid out without display:none and preserves DOM order across tab switches', async () => {
  useTerminalStore.setState({
    sessions: [session('term-b'), session('term-a')],
    activeSessionId: 'term-a',
    primarySessionId: 'term-a',
    secondarySessionId: null,
    splitMode: 'none',
  });

  const view = render(
    <Suspense fallback={null}>
      <TerminalGrid onOpenCreateWorktree={() => {}} onOpenTerminalModal={() => {}} />
    </Suspense>
  );

  const paneA = (await screen.findByTestId('xterm-term-a')).parentElement!;
  const paneB = (await screen.findByTestId('xterm-term-b')).parentElement!;

  expect(paneA.classList.contains('hidden')).toBe(false);
  expect(paneB.classList.contains('hidden')).toBe(false);
  expect(paneB.classList.contains('invisible')).toBe(true);
  expect(paneB.classList.contains('pointer-events-none')).toBe(true);
  expect(paneB.getAttribute('aria-hidden')).toBe('true');
  expect(paneB.hasAttribute('inert')).toBe(true);
  expect(paneA.getAttribute('aria-hidden')).toBeNull();
  expect(paneA.hasAttribute('inert')).toBe(false);

  const initialChildren = Array.from(view.container.firstElementChild!.children);
  expect(initialChildren).toEqual([paneA, paneB]);

  act(() => {
    useTerminalStore.getState().setActiveSession('term-b');
  });

  expect(Array.from(view.container.firstElementChild!.children)).toEqual([paneA, paneB]);
  expect(paneA.classList.contains('invisible')).toBe(true);
  expect(paneA.getAttribute('aria-hidden')).toBe('true');
  expect(paneB.classList.contains('invisible')).toBe(false);
  expect(paneB.getAttribute('aria-hidden')).toBeNull();
});

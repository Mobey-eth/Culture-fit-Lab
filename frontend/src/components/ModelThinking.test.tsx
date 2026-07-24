import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelThinking from './ModelThinking';

vi.mock('thinking-orbs', () => ({
  ThinkingOrb: ({ state, size }: { state: string; size: number }) => (
    <canvas data-testid="thinking-orb" data-state={state} data-size={size} />
  ),
}));

afterEach(() => vi.useRealTimers());

describe('ModelThinking', () => {
  it('announces progress and rotates playful, task-specific coaching copy', () => {
    vi.useFakeTimers();
    render(<ModelThinking context="coaching" dark />);

    expect(screen.getByRole('status')).toHaveTextContent('Building your coaching');
    expect(screen.getByRole('status')).toHaveTextContent('Cooking up your coaching…');
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'shaping');
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-size', '64');

    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByRole('status')).toHaveTextContent('Letting the patterns simmer…');
  });

  it('uses question-aware copy and the searching orb for a hint', () => {
    render(<ModelThinking context="hint" />);

    expect(screen.getByRole('status')).toHaveTextContent('Reading the trade-off…');
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'searching');
  });

  it('uses the tuned inline orb in coach conversations', () => {
    render(<ModelThinking context="conversation" compact />);

    expect(screen.getByRole('status')).toHaveTextContent('Listening closely…');
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-size', '20');
  });
});

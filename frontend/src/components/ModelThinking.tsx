import { useEffect, useState } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';

type ThinkingContext = 'hint' | 'coaching' | 'conversation';

type Props = {
  context: ThinkingContext;
  compact?: boolean;
  dark?: boolean;
  className?: string;
};

const THINKING_COPY: Record<ThinkingContext, {
  heading: string;
  state: OrbState;
  messages: string[];
}> = {
  hint: {
    heading: 'Thinking with this question',
    state: 'searching',
    messages: [
      'Reading the trade-off…',
      'Comparing the choices…',
      'Looking for the useful tension…',
      'Tailoring this hint to the question…',
      'Nearly ready…',
    ],
  },
  coaching: {
    heading: 'Building your coaching',
    state: 'shaping',
    messages: [
      'Cooking up your coaching…',
      'Letting the patterns simmer…',
      'Connecting a few dots…',
      'Beating around the bush… briefly.',
      'Tailoring it for you…',
      'Checking the balance…',
      'Turning patterns into practice…',
      'Almost ready to serve…',
    ],
  },
  conversation: {
    heading: 'Your coach is on it',
    state: 'composing',
    messages: [
      'Listening closely…',
      'Checking your correction…',
      'Connecting it to your results…',
      'Searching the practice bank…',
      'Tailoring the next step…',
      'Putting the reply together…',
    ],
  },
};

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ModelThinking({ context, compact = false, dark = false, className = '' }: Props) {
  const copy = THINKING_COPY[context];
  const [messageIndex, setMessageIndex] = useState(0);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    setMessageIndex(0);
    if (reducedMotion) return undefined;

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % copy.messages.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [context, copy.messages.length, reducedMotion]);

  const message = copy.messages[messageIndex];
  const classes = [
    'model-thinking',
    compact ? 'model-thinking--compact' : 'model-thinking--card',
    dark ? 'model-thinking--dark' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite" aria-atomic="true">
      <span className="model-thinking__orb" aria-hidden="true">
        <ThinkingOrb
          state={copy.state}
          size={compact ? 20 : 64}
          theme={dark ? 'dark' : 'light'}
          speed={0.92}
          paused={reducedMotion}
        />
      </span>
      <span className="model-thinking__copy">
        {!compact && <strong>{copy.heading}</strong>}
        <span className="model-thinking__message" key={message}>{message}</span>
      </span>
    </div>
  );
}

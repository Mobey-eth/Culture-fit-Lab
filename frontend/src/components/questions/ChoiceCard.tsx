import { Check } from 'lucide-react';
import type { OptionLetter } from '../../types';

type Props = {
  letter: OptionLetter;
  text: string;
  firstLabel: string;
  secondLabel: string;
  firstSelected: boolean;
  secondSelected: boolean;
  onFirst: () => void;
  onSecond: () => void;
};

export default function ChoiceCard({
  letter, text, firstLabel, secondLabel, firstSelected, secondSelected, onFirst, onSecond,
}: Props) {
  return (
    <article className={`answer-card${firstSelected || secondSelected ? ' answer-card--selected' : ''}`} data-option={letter}>
      <div className="answer-card__statement"><span className="answer-card__letter">{letter}</span><p>{text}</p></div>
      <div className="answer-card__controls">
        <button
          type="button" className={`choice-button choice-button--first${firstSelected ? ' is-selected' : ''}`}
          aria-pressed={firstSelected} aria-label={`${firstLabel}: ${text}`} disabled={secondSelected} onClick={onFirst}
        >
          {firstLabel}
        </button>
        <button
          type="button" className={`choice-button choice-button--second${secondSelected ? ' is-selected' : ''}`}
          aria-pressed={secondSelected} aria-label={`${secondLabel}: ${text}`} disabled={firstSelected} onClick={onSecond}
        >
          {secondLabel}
        </button>
      </div>
      {(firstSelected || secondSelected) && (
        <div className="answer-card__status"><Check size={13} /> Selected as {firstSelected ? firstLabel : secondLabel}</div>
      )}
    </article>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { AssessmentResponse, CandidateQuestion, OptionLetter } from '../../types';

type Props = {
  question: CandidateQuestion;
  response?: AssessmentResponse;
  onPick: (slot: 'mostResponse' | 'secondResponse', letter: OptionLetter) => void;
};

function reduceMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function FirstSecondQuestion({ question, response, onPick }: Props) {
  const [leavingLetter, setLeavingLetter] = useState<OptionLetter | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const selectionTimer = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const changeButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldMoveFocus = useRef(false);
  const firstChoice = response?.mostResponse ?? null;
  const secondChoice = response?.secondResponse ?? null;
  const complete = Boolean(firstChoice && secondChoice);
  const choosingSecond = Boolean(firstChoice && !secondChoice);
  const stage = complete ? 'complete' : choosingSecond ? 'second' : 'first';

  useEffect(() => () => {
    if (selectionTimer.current !== null) window.clearTimeout(selectionTimer.current);
  }, []);

  useEffect(() => {
    if (!shouldMoveFocus.current) return;
    if (stage === 'complete') changeButtonRef.current?.focus();
    else listRef.current?.querySelector<HTMLButtonElement>('button.ranked-card--pick')?.focus();
    shouldMoveFocus.current = false;
  }, [stage]);

  const chooseFirst = (letter: OptionLetter) => {
    if (leavingLetter) return;
    if (reduceMotion()) {
      shouldMoveFocus.current = true;
      onPick('mostResponse', letter);
      return;
    }

    setLeavingLetter(letter);
    selectionTimer.current = window.setTimeout(() => {
      shouldMoveFocus.current = true;
      onPick('mostResponse', letter);
      setLeavingLetter(null);
      selectionTimer.current = null;
    }, 240);
  };

  const chooseSecond = (letter: OptionLetter) => {
    shouldMoveFocus.current = true;
    onPick('secondResponse', letter);
  };

  const resetChoices = () => {
    shouldMoveFocus.current = true;
    if (firstChoice) onPick('mostResponse', firstChoice);
    if (secondChoice) onPick('secondResponse', secondChoice);
  };

  const visibleOptions = complete
    ? question.options
    : question.options.filter((option) => !choosingSecond || option.letter !== firstChoice);

  return (
    <div className={`ranked-choice ranked-choice--${stage}`} role="group" aria-label="Choose one first choice and one different second choice">
      {(complete || showGuide) ? (
        <div className={`ranked-choice__guide${complete ? ' ranked-choice__guide--complete' : ''}`} aria-live="polite">
          {complete ? (
            <>
              <div><span>Choices saved</span><strong>Your first and second choices are marked below.</strong></div>
              <button ref={changeButtonRef} className="text-button" type="button" onClick={resetChoices}>Change choices</button>
            </>
          ) : (
            <>
              <div>
                <span>Step {choosingSecond ? '2' : '1'} of 2</span>
                <strong>{choosingSecond ? 'Now select your second choice' : 'Select your first choice'}</strong>
                <small>{choosingSecond ? 'Your first choice is tucked away while you decide.' : 'Choose the statement that best reflects your usual priority.'}</small>
              </div>
              <button className="text-button ranked-choice__hide-guide" type="button" onClick={() => setShowGuide(false)}>Hide tip</button>
            </>
          )}
        </div>
      ) : (
        <button className="text-button ranked-choice__show-guide" type="button" onClick={() => setShowGuide(true)}>Show selection tip</button>
      )}

      <div ref={listRef} className="answer-list ranked-choice__list">
        {visibleOptions.map((option) => {
          const selectedFirst = firstChoice === option.letter;
          const selectedSecond = secondChoice === option.letter;

          if (complete) {
            return (
              <article
                className={`ranked-card ranked-card--review${selectedFirst ? ' ranked-card--first' : ''}${selectedSecond ? ' ranked-card--second' : ''}`}
                data-option={option.letter}
                key={option.letter}
              >
                <span className="ranked-card__statement"><span className="answer-card__letter">{option.letter}</span><span>{option.text}</span></span>
                {(selectedFirst || selectedSecond) && <span className="ranked-card__result">{selectedFirst ? 'First choice' : 'Second choice'}</span>}
              </article>
            );
          }

          const choiceName = choosingSecond ? 'second' : 'first';
          return (
            <button
              className={`ranked-card ranked-card--pick${leavingLetter === option.letter ? ' is-leaving' : ''}`}
              data-option={option.letter}
              type="button"
              key={option.letter}
              disabled={Boolean(leavingLetter)}
              aria-label={`Select as ${choiceName} choice: ${option.text}`}
              onClick={() => choosingSecond ? chooseSecond(option.letter) : chooseFirst(option.letter)}
            >
              <span className="ranked-card__statement"><span className="answer-card__letter">{option.letter}</span><span>{option.text}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

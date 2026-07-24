import type { AssessmentResponse, CandidateQuestion, OptionLetter } from '../../types';
import ChoiceCard from './ChoiceCard';

type Props = { question: CandidateQuestion; response?: AssessmentResponse; onPick: (slot: 'mostResponse' | 'leastResponse', letter: OptionLetter) => void };

export default function SjtQuestion({ question, response, onPick }: Props) {
  return (
    <div className="answer-list answer-list--sjt" role="group" aria-label="Choose one most likely and one least likely action">
      {question.options.map((option) => (
        <ChoiceCard
          key={option.letter} letter={option.letter} text={option.text}
          firstLabel="Most likely" secondLabel="Least likely"
          firstSelected={response?.mostResponse === option.letter}
          secondSelected={response?.leastResponse === option.letter}
          onFirst={() => onPick('mostResponse', option.letter)}
          onSecond={() => onPick('leastResponse', option.letter)}
        />
      ))}
    </div>
  );
}

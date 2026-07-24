import type { AssessmentResponse, CandidateQuestion, OptionLetter } from '../../types';
import ChoiceCard from './ChoiceCard';

type Props = { question: CandidateQuestion; response?: AssessmentResponse; onPick: (slot: 'mostResponse' | 'leastResponse', letter: OptionLetter) => void };

export default function MostLeastQuestion({ question, response, onPick }: Props) {
  return (
    <div className="answer-list" role="group" aria-label="Choose one most like you and one least like you">
      {question.options.map((option) => (
        <ChoiceCard
          key={option.letter} letter={option.letter} text={option.text}
          firstLabel="Most like me" secondLabel="Least like me"
          firstSelected={response?.mostResponse === option.letter}
          secondSelected={response?.leastResponse === option.letter}
          onFirst={() => onPick('mostResponse', option.letter)}
          onSecond={() => onPick('leastResponse', option.letter)}
        />
      ))}
    </div>
  );
}

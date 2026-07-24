import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyResponse, isResponseValid, setChoice } from '../../lib/assessment';
import type { AssessmentResponse, CandidateQuestion, OptionLetter } from '../../types';
import FirstSecondQuestion from './FirstSecondQuestion';
import MostLeastQuestion from './MostLeastQuestion';
import SjtQuestion from './SjtQuestion';

const baseOptions = [
  { letter: 'A' as const, text: 'Statement alpha' },
  { letter: 'B' as const, text: 'Statement beta' },
  { letter: 'C' as const, text: 'Statement gamma' },
];

function question(responseMode: CandidateQuestion['responseMode']): CandidateQuestion {
  return {
    itemId: `test-${responseMode}`, itemType: responseMode === 'sjt_best_worst_4' ? 'Situational judgment' : 'Work style',
    responseMode, instruction: 'Choose carefully.', stem: 'A sample item',
    options: responseMode === 'sjt_best_worst_4' ? [...baseOptions, { letter: 'D', text: 'Statement delta' }] : baseOptions,
  };
}

function Harness({ mode }: { mode: CandidateQuestion['responseMode'] }) {
  const item = question(mode);
  const [response, setResponse] = useState<AssessmentResponse>(() => emptyResponse(item, '00000000-0000-4000-8000-000000000000'));
  const pick = (slot: 'mostResponse' | 'leastResponse' | 'secondResponse', letter: OptionLetter) => setResponse((value) => setChoice(value, slot, letter));
  return (
    <>
      {mode === 'most_least_3' && <MostLeastQuestion question={item} response={response} onPick={pick} />}
      {mode === 'first_second_3' && <FirstSecondQuestion question={item} response={response} onPick={pick} />}
      {mode === 'sjt_best_worst_4' && <SjtQuestion question={item} response={response} onPick={pick} />}
      <output data-testid="valid">{String(isResponseValid(item, response))}</output>
    </>
  );
}

describe('response components', () => {
  it('requires different MOST and LEAST statements', async () => {
    const user = userEvent.setup();
    render(<Harness mode="most_least_3" />);
    await user.click(screen.getByRole('button', { name: 'Most like me: Statement alpha' }));
    expect(screen.getByRole('button', { name: 'Least like me: Statement alpha' })).toBeDisabled();
    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    await user.click(screen.getByRole('button', { name: 'Least like me: Statement beta' }));
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: 'Least like me: Statement beta' }))
      .toHaveClass('choice-button--second', 'is-selected');
  });

  it('uses FIRST/SECOND wording and never converts it to MOST/LEAST', async () => {
    const user = userEvent.setup();
    render(<Harness mode="first_second_3" />);
    expect(screen.queryByText('Most like me')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'First choice: Statement alpha' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Select as first choice/ })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Hide tip' }));
    expect(screen.queryByText('Select your first choice')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show selection tip' }));
    expect(screen.getByText('Select your first choice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select as first choice: Statement alpha' }));
    expect(screen.getByRole('button', { name: 'Select as first choice: Statement alpha' })).toHaveClass('is-leaving');
    await waitFor(() => expect(screen.queryByText('Statement alpha')).not.toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /Select as second choice/ })).toHaveLength(2);
    expect(screen.getByText('Now select your second choice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select as second choice: Statement gamma' }));
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
    expect(screen.getByText('Choices saved')).toBeInTheDocument();
    expect(screen.getAllByText(/Statement (alpha|beta|gamma)/)).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Change choices' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change choices' }));
    expect(screen.getByText('Select your first choice')).toBeInTheDocument();
    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    expect(screen.getAllByRole('button', { name: /Select as first choice/ })).toHaveLength(3);
  });

  it('renders four SJT actions and prevents duplicate likely choices', async () => {
    const user = userEvent.setup();
    render(<Harness mode="sjt_best_worst_4" />);
    expect(screen.getAllByText(/Statement (alpha|beta|gamma|delta)/)).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Most likely: Statement delta' }));
    expect(screen.getByRole('button', { name: 'Least likely: Statement delta' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Least likely: Statement beta' }));
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
  });
});

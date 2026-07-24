import { access, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next common location.
  }
}
if (!executablePath) throw new Error('Set CHROME_PATH to run the browser smoke test.');

const output = resolve(process.cwd(), '../artifacts');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
let guideDismissalVerified = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function answerCurrentQuestion(page, onFirstSecondStepTwo) {
  if (await page.locator('.ranked-choice').count()) {
    if (!guideDismissalVerified) {
      await page.getByRole('button', { name: 'Hide tip' }).click();
      assert(await page.locator('.ranked-choice__guide').count() === 0, 'First/second selection tip did not dismiss.');
      await page.getByRole('button', { name: 'Show selection tip' }).click();
      assert(await page.locator('.ranked-choice__guide').isVisible(), 'Dismissed first/second selection tip could not be restored.');
      guideDismissalVerified = true;
    }
    const firstStepCards = page.locator('button.ranked-card--pick');
    assert(await firstStepCards.count() === 3, 'First-choice step should show three selectable statement cards.');
    assert(await page.locator('.ranked-choice .choice-button').count() === 0, 'First/second questions should not show separate choice buttons.');
    await firstStepCards.first().click();
    await page.waitForFunction(() => document.querySelectorAll('button.ranked-card--pick').length === 2);
    const secondStepCards = page.locator('button.ranked-card--pick');
    assert(await secondStepCards.count() === 2, 'The first choice should fade away before the second-choice step.');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('button.ranked-card--pick')).opacity === '1');
    if (onFirstSecondStepTwo) await onFirstSecondStepTwo();
    await secondStepCards.first().click();
    await page.locator('.ranked-choice--complete').waitFor({ state: 'visible' });
    assert(await page.locator('.ranked-card--review').count() === 3, 'Completed choices should return for review.');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ranked-card--review')).opacity === '1');
    return 'first_second';
  }

  const cards = page.locator('.answer-card');
  assert(await cards.count() >= 2, 'Expected selectable answer cards.');
  await cards.first().locator('.choice-button--first').click();
  const leastButton = cards.nth(1).locator('.choice-button--second');
  await leastButton.click();
  if (!await page.locator('.scenario-panel').count()) {
    assert((await leastButton.getAttribute('class'))?.includes('is-selected'), 'LEAST choice did not enter its selected state.');
    await page.waitForFunction(() => {
      const selected = document.querySelector('.choice-button--second.is-selected');
      return selected && getComputedStyle(selected).backgroundColor === 'rgb(163, 60, 53)';
    });
    const background = await leastButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    assert(background === 'rgb(163, 60, 53)', `Selected LEAST button should be red; received ${background}.`);
    return 'most_least';
  }
  return 'sjt';
}

try {
  const seriousContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await seriousContext.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  assert(await page.getByRole('heading', { name: 'Keen judgment. Consistent character.' }).isVisible(), 'Landing heading is missing.');
  assert(await page.locator('.mode-card').count() === 4, 'Expected four practice modes.');
  assert((await page.locator('.brand').innerText()).trim() === 'Moby', 'Header should only show the Moby name.');
  assert(await page.locator('.hero__metric').count() === 3, 'Expected three concise hero badges.');
  const heroBadgeText = (await page.locator('.hero__visual').innerText()).replace(/\s+/g, ' ');
  assert(heroBadgeText.includes('200 culture-fit questions'), 'Question-bank hero badge is missing.');
  assert(heroBadgeText.includes('AI coaching on demand'), 'AI coaching hero badge is missing.');
  await page.locator('.topbar__signin').click();
  assert(await page.getByLabel('Username').isVisible(), 'Login should use a username field.');
  await page.getByRole('tab', { name: 'Create account' }).click();
  assert(await page.getByLabel('Email (optional)').isVisible(), 'Signup email should be optional.');
  assert(await page.getByLabel('Password', { exact: true }).getAttribute('minlength') === '5', 'Signup password minimum should be five characters.');
  assert(await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'password', 'Password should be hidden initially.');
  await page.getByRole('button', { name: 'Show password' }).click();
  assert(await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'text', 'Show-password control did not reveal the password.');
  await page.getByRole('button', { name: 'Hide password' }).click();
  assert(await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'password', 'Hide-password control did not mask the password again.');
  assert(await page.locator('.auth-dialog select option').count() === 11, 'Expected a placeholder and ten recovery questions.');
  assert(await page.getByText('Optional account', { exact: true }).count() === 0, 'Optional account label should be removed.');
  await page.screenshot({ path: resolve(output, 'signup-desktop.png'), fullPage: false });
  await page.getByRole('button', { name: 'Close account dialog' }).click();
  await page.locator('.mode-card').filter({ hasText: 'Serious Simulation' }).click();
  await page.getByRole('button', { name: /Start Serious Simulation/ }).click();
  await page.locator('.question-shell').waitFor({ state: 'visible' });
  assert(await page.locator('.timer-chip').isVisible(), 'Serious mode timer is missing.');
  assert(await page.locator('.button--hint').count() === 0, 'Serious mode must not expose hints.');
  assert((await page.locator('.assessment-progress').innerText()).includes('of 60'), 'Serious mode did not load 60 questions.');

  await answerCurrentQuestion(page);
  assert(await page.locator('.question-toolbar__next').isEnabled(), 'Next should enable after a valid response.');
  await page.screenshot({ path: resolve(output, 'assessment-desktop.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.locator('.resume-card').isVisible(), 'Refresh did not restore an unfinished attempt prompt.');
  await page.getByRole('button', { name: /Resume/ }).click();
  await page.locator('.question-shell').waitFor({ state: 'visible' });
  assert((await page.locator('.assessment-progress').innerText()).includes('of 60'), 'Resumed attempt lost its question set.');
  assert(errors.length === 0, `Browser console errors: ${errors.join(' | ')}`);
  await seriousContext.close();

  const guidedContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const guided = await guidedContext.newPage();
  await guided.route('**/api/ai/hint', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hint: {
          title: 'Notice the trade-off',
          guidance: 'Compare what each statement would look like in the situation described.',
          strongAnswer: 'A considered choice that reflects dependable behaviour in this context.',
          weakAnswer: 'Choosing a statement only because it sounds impressive.',
          reflectionQuestion: 'Which option best matches what you usually do?',
        },
      }),
    });
  });
  await guided.route('**/api/ai/analyze', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coaching: {
          summary: 'Your answers show a useful base to build on.',
          strengths: ['You kept several teamwork and dependability signals visible.'],
          coachingTips: ['Keep your choices grounded in behaviour you can repeat.'],
          practicePlan: ['Practise one related cluster and compare your reasoning.'],
          consistencyCoaching: 'Answer from the same real-world reference point each time.',
        },
      }),
    });
  });
  await guided.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await guided.getByRole('button', { name: /Start Guided Drill/ }).click();
  await guided.locator('.question-shell').waitFor({ state: 'visible' });
  assert(await guided.locator('.button--hint').isVisible(), 'Guided mode should expose an on-demand hint button.');
  await guided.locator('.button--hint').click();
  await guided.locator('.hint-area .model-thinking').waitFor({ state: 'visible' });
  assert(await guided.locator('.hint-area canvas').count() === 1, 'Hint loading should show a thinking orb.');
  await guided.waitForFunction(() => document.querySelector('.hint-area .model-thinking')?.textContent?.includes('Comparing the choices'));
  await guided.screenshot({ path: resolve(output, 'hint-thinking-desktop.png'), fullPage: false });
  await guided.setViewportSize({ width: 390, height: 844 });
  assert(await guided.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Mobile hint state overflows horizontally.');
  await guided.locator('.hint-area .model-thinking').scrollIntoViewIfNeeded();
  await guided.screenshot({ path: resolve(output, 'hint-thinking-mobile.png'), fullPage: false });
  await guided.setViewportSize({ width: 1100, height: 850 });
  await guided.locator('.hint-card').waitFor({ state: 'visible' });
  const observedModes = new Set();
  let capturedFirstSecondStep = false;
  for (let index = 0; index < 20; index += 1) {
    const mode = await answerCurrentQuestion(guided, capturedFirstSecondStep ? undefined : async () => {
      await guided.locator('.ranked-choice').scrollIntoViewIfNeeded();
      await guided.screenshot({ path: resolve(output, 'first-second-step-two-desktop.png'), fullPage: false });
      await guided.setViewportSize({ width: 390, height: 844 });
      assert(await guided.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Mobile first/second choices overflow horizontally.');
      await guided.locator('.ranked-choice').scrollIntoViewIfNeeded();
      await guided.screenshot({ path: resolve(output, 'first-second-step-two-mobile.png'), fullPage: false });
      await guided.setViewportSize({ width: 1100, height: 850 });
      capturedFirstSecondStep = true;
    });
    observedModes.add(mode);
    if (mode === 'first_second' && !observedModes.has('first_second_screenshot')) {
      await guided.screenshot({ path: resolve(output, 'first-second-complete-desktop.png'), fullPage: false });
      observedModes.add('first_second_screenshot');
    }
    await guided.locator('.question-toolbar__next').click();
  }
  assert(observedModes.has('first_second'), 'Guided sampling did not exercise the two-step first/second interaction.');
  assert(observedModes.has('most_least'), 'Guided sampling did not exercise the red LEAST selection state.');
  await guided.locator('.review-page').waitFor({ state: 'visible' });
  await guided.getByRole('button', { name: 'Submit assessment' }).click();
  await guided.getByRole('button', { name: 'Submit now' }).click();
  await guided.locator('.results-page').waitFor({ state: 'visible' });
  assert(!(await guided.locator('.result-stats').innerText()).includes('No repeated cluster to compare'), 'Guided sampling did not produce related question pairs.');
  assert(await guided.locator('.key-pattern-chart').isVisible(), 'Key competency chart is missing.');
  assert(await guided.locator('.distribution-chart').isVisible(), 'Competency distribution chart is missing.');
  await guided.locator('.competency-details summary').click();
  await guided.locator('.competency-details.is-visible').waitFor({ state: 'visible' });
  await guided.waitForFunction(() => getComputedStyle(document.querySelector('.competency-details')).opacity === '1');
  assert(await guided.locator('.competency').count() === 24, 'Expanded results did not render all 24 competencies.');
  assert(await guided.locator('.focus-section').isVisible(), 'Next-attempt focus section is missing.');
  assert(await guided.locator('.focus-card').count() > 0, 'No result focus tips were generated.');
  assert(await guided.locator('.focus-question').count() > 0, 'Focus tips should point back to relevant questions.');
  assert(await guided.locator('.coach-dialogue').isVisible(), 'Results coaching conversation section is missing.');
  assert(await guided.getByRole('heading', { name: 'Understand your results and know what to practise' }).isVisible(), 'AI results review purpose is not clear.');
  assert(await guided.locator('.ai-coach__header > span').count() === 0, 'AI results review should not show a decorative icon.');
  assert(!(await guided.locator('.ai-coach').innerText()).includes('Optional · DeepSeek V4 Pro'), 'Model vendor label should not be shown.');
  assert((await guided.locator('.coach-dialogue').innerText()).includes('different from the results review above'), 'The conversation section should explain how it differs from the results review.');
  assert(await guided.locator('.coach-signin').isVisible(), 'Anonymous users should see the coaching login prompt.');
  assert(await guided.locator('.coach-signin').getByRole('button', { name: 'Login' }).isVisible(), 'Coaching login action is missing.');
  await guided.locator('.focus-question').first().locator('summary').click();
  assert(await guided.locator('.focus-question[open]').count() === 1, 'A focus question pointer did not expand.');
  assert(await guided.getByRole('button', { name: 'Practice focus questions' }).isEnabled(), 'Focus questions should be retryable.');
  assert(!(await guided.locator('.results-page').innerText()).includes('check for overuse'), 'Overuse wording was not simplified.');
  assert(await guided.getByRole('button', { name: /Generate AI coaching/ }).isVisible(), 'AI coaching must be available on demand.');
  assert(await guided.getByRole('button', { name: /Generate AI coaching/ }).locator('svg').count() === 0, 'AI coaching button should not have a decorative icon.');
  await guided.getByRole('button', { name: /Generate AI coaching/ }).click();
  await guided.locator('.ai-coach__thinking').waitFor({ state: 'visible' });
  assert(await guided.locator('.ai-coach__thinking canvas').count() === 1, 'Results coaching should show a thinking orb.');
  assert(await guided.getByRole('button', { name: /Building your coaching/ }).locator('svg').count() === 0, 'Loading button should remain text-only.');
  await guided.waitForFunction(() => document.querySelector('.ai-coach__thinking')?.textContent?.includes('Letting the patterns simmer'));
  await guided.screenshot({ path: resolve(output, 'results-thinking-desktop.png'), fullPage: true });
  await guided.locator('.coaching-content').waitFor({ state: 'visible' });
  assert(await guided.getByRole('button', { name: /Response JSON/ }).count() === 0, 'Response JSON button should not be shown.');
  await guided.screenshot({ path: resolve(output, 'results-desktop.png'), fullPage: true });
  const downloadPromise = guided.waitForEvent('download');
  await guided.getByRole('button', { name: /Download PDF report/ }).click();
  const report = await downloadPromise;
  const reportPath = resolve(output, 'culturefit-smoke-report.pdf');
  await report.saveAs(reportPath);
  assert((await readFile(reportPath)).length > 12_000, 'Detailed PDF report is unexpectedly small.');
  await guided.setViewportSize({ width: 390, height: 844 });
  assert(await guided.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Mobile results page overflows horizontally.');
  await guided.screenshot({ path: resolve(output, 'results-mobile.png'), fullPage: true });
  await guidedContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage();
  await mobile.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Mobile landing page overflows horizontally.');
  const mobileStart = await mobile.evaluate(() => {
    const bar = document.querySelector('.start-bar');
    const button = bar?.querySelector('button');
    if (!(bar instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return null;
    const rect = button.getBoundingClientRect();
    return {
      position: getComputedStyle(bar).position,
      visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
      label: button.textContent?.trim(),
    };
  });
  assert(mobileStart?.position === 'fixed', 'Mobile Start action should stay fixed within reach.');
  assert(mobileStart?.visible, 'Mobile Start action is not visible without scrolling.');
  assert(mobileStart?.label?.includes('Start Guided Drill'), 'Mobile Start action lost the selected mode label.');
  await mobile.screenshot({ path: resolve(output, 'landing-mobile.png'), fullPage: true });
  await mobileContext.close();

  console.log('Browser smoke test passed: serious mode, response validation, refresh resume, animated AI thinking states, results, on-demand PDF, and mobile overflow.');
} finally {
  await browser.close();
}

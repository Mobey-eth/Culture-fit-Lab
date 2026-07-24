import PDFDocument from 'pdfkit';
import type { AssessmentResult, CompetencyScore, FocusArea } from '../types.js';
import type { Coaching } from './deepseek.js';

const palette = {
  navy: '#16324F',
  navyDeep: '#0C2238',
  teal: '#0F9D8B',
  tealDark: '#0F766E',
  tealPale: '#E4F7F3',
  blue: '#3478D4',
  bluePale: '#EAF2FF',
  violet: '#7357D8',
  violetPale: '#F0ECFF',
  coral: '#E85D5D',
  coralPale: '#FFF0EF',
  amber: '#F0A62B',
  amberPale: '#FFF6DF',
  ink: '#243E55',
  muted: '#627589',
  line: '#D7E2EA',
  track: '#E7EDF2',
  paper: '#FFFFFF',
  soft: '#F7FAFC',
} as const;

const margin = 44;
const footerTopOffset = 48;

type Doc = PDFKit.PDFDocument;

function cleanText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

function contentWidth(doc: Doc) {
  return doc.page.width - margin * 2;
}

function contentBottom(doc: Doc) {
  return doc.page.height - footerTopOffset;
}

function drawRunningHeader(doc: Doc) {
  doc.rect(0, 0, doc.page.width, 7).fill(palette.teal);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.navy).text('MOBY', margin, 24, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(palette.muted).text('CULTURE-FIT PRACTICE REPORT', margin + 40, 25, { lineBreak: false });
  doc.moveTo(margin, 45).lineTo(doc.page.width - margin, 45).lineWidth(0.7).strokeColor(palette.line).stroke();
  doc.y = 60;
}

function addReportPage(doc: Doc) {
  doc.addPage();
  drawRunningHeader(doc);
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > contentBottom(doc)) addReportPage(doc);
}

function drawParagraph(
  doc: Doc,
  value: string,
  options: { size?: number; color?: string; width?: number; x?: number; lineGap?: number; gapAfter?: number; font?: string } = {},
) {
  const text = cleanText(value);
  if (!text) return;
  const x = options.x ?? margin;
  const width = options.width ?? contentWidth(doc);
  const size = options.size ?? 9.5;
  const lineGap = options.lineGap ?? 2.6;
  const gapAfter = options.gapAfter ?? 8;
  const font = options.font ?? 'Helvetica';
  doc.font(font).fontSize(size);
  const height = doc.heightOfString(text, { width, lineGap });
  ensureSpace(doc, height + gapAfter);
  const y = doc.y;
  doc.fillColor(options.color ?? palette.ink).text(text, x, y, { width, lineGap });
  doc.y = y + height + gapAfter;
}

function drawPageTitle(doc: Doc, title: string, description: string) {
  doc.font('Helvetica-Bold').fontSize(23).fillColor(palette.navy).text(cleanText(title), margin, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.3);
  drawParagraph(doc, description, { size: 9.5, color: palette.muted, lineGap: 2.8, gapAfter: 15 });
}

function drawSectionTitle(doc: Doc, title: string, description?: string) {
  ensureSpace(doc, description ? 55 : 34);
  doc.font('Helvetica-Bold').fontSize(15.5).fillColor(palette.navy).text(cleanText(title), margin, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.25);
  if (description) drawParagraph(doc, description, { size: 8.7, color: palette.muted, lineGap: 2.4, gapAfter: 10 });
  else doc.moveDown(0.45);
}

function metricValueSize(value: string) {
  if (value.length > 15) return 10.5;
  if (value.length > 9) return 13;
  return 18;
}

function drawMetricGrid(doc: Doc, result: AssessmentResult) {
  const consistencyMeasured = result.consistency.evaluatedClusters > 0;
  const cards = [
    {
      label: 'COMPLETION', value: `${result.completion.answered}/${result.completion.total}`,
      detail: `${result.completion.percentage}% of this session answered`, accent: palette.blue, background: palette.bluePale,
    },
    {
      label: 'CONSISTENCY', value: consistencyMeasured ? result.consistency.label : 'Not measured',
      detail: consistencyMeasured
        ? `${result.consistency.percentage}% across ${result.consistency.evaluatedClusters} repeated areas`
        : 'No repeated areas were available to compare',
      accent: palette.teal, background: palette.tealPale,
    },
    {
      label: 'SCENARIO JUDGMENT', value: result.scenarioJudgment.total ? `${result.scenarioJudgment.percentage}%` : 'Not measured',
      detail: result.scenarioJudgment.total
        ? `${result.scenarioJudgment.total} workplace scenarios scored separately`
        : 'No scenario questions in this session',
      accent: palette.violet, background: palette.violetPale,
    },
    {
      label: 'PRACTICE PROFILE', value: result.competencies.some((item) => item.opportunities) ? `${result.profileAlignment}%` : 'Not measured',
      detail: 'How often priority work traits appeared. This is not pass or fail.',
      accent: palette.amber, background: palette.amberPale,
    },
  ];
  const gap = 12;
  const cardWidth = (contentWidth(doc) - gap) / 2;
  const cardHeight = 78;
  const startY = doc.y;

  cards.forEach((card, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);
    doc.roundedRect(x, y, cardWidth, cardHeight, 9).fillAndStroke(card.background, card.accent);
    doc.roundedRect(x, y, 6, cardHeight, 3).fill(card.accent);
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(card.accent).text(card.label, x + 17, y + 12, { width: cardWidth - 30, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(metricValueSize(card.value)).fillColor(palette.navy).text(card.value, x + 17, y + 27, { width: cardWidth - 30, lineBreak: false });
    doc.font('Helvetica').fontSize(7.9).fillColor(palette.muted).text(card.detail, x + 17, y + 51, { width: cardWidth - 30, height: 22, lineGap: 1.5 });
  });
  doc.y = startY + cardHeight * 2 + gap + 19;
}

function plainBand(competency: CompetencyScore) {
  if (!competency.opportunities || competency.band === 'not_sampled') return 'Not sampled';
  if (competency.band === 'possible_overuse') return 'Very high, check balance';
  if (competency.band === 'strong') return 'Clear strength';
  if (competency.band === 'balanced') return 'Balanced pattern';
  return 'Less evident';
}

function bandColor(competency: CompetencyScore) {
  if (!competency.opportunities || competency.band === 'not_sampled') return '#B8C5CF';
  if (competency.band === 'possible_overuse') return palette.amber;
  if (competency.band === 'strong') return palette.teal;
  if (competency.band === 'balanced') return palette.blue;
  return palette.coral;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function donutSegmentPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const outerStart = polarPoint(cx, cy, outer, start);
  const outerEnd = polarPoint(cx, cy, outer, end);
  const innerEnd = polarPoint(cx, cy, inner, end);
  const innerStart = polarPoint(cx, cy, inner, start);
  const largeArc = end - start > 180 ? 1 : 0;
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    'Z',
  ].join(' ');
}

function drawDonut(
  doc: Doc,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  segments: Array<{ value: number; color: string }>,
  centreColor: string,
) {
  doc.circle(cx, cy, outer).fill(palette.track);
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (total > 0) {
    let angle = -90;
    for (const segment of segments) {
      if (segment.value <= 0) continue;
      const sweep = (segment.value / total) * 360;
      if (sweep >= 359.999) doc.circle(cx, cy, outer).fill(segment.color);
      else doc.path(donutSegmentPath(cx, cy, outer, inner, angle, angle + sweep)).fill(segment.color);
      angle += sweep;
    }
  }
  doc.circle(cx, cy, inner).fill(centreColor);
}

function keyCompetencies(result: AssessmentResult) {
  const priority: Record<CompetencyScore['band'], number> = {
    possible_overuse: 4, strong: 3, developing: 2, balanced: 1, not_sampled: 0,
  };
  return result.competencies
    .filter((item) => item.opportunities > 0)
    .sort((left, right) => priority[right.band] - priority[left.band]
      || right.opportunities - left.opportunities
      || Math.abs(right.score - 50) - Math.abs(left.score - 50))
    .slice(0, 6);
}

function drawCompetencyChart(doc: Doc, competencies: CompetencyScore[]) {
  if (!competencies.length) {
    drawParagraph(doc, 'Complete more work-style questions to build a competency chart.', { color: palette.muted });
    return;
  }
  for (const competency of competencies) {
    ensureSpace(doc, 27);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.2).fillColor(palette.ink).text(cleanText(competency.name), margin, y, { width: 330, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(palette.muted).text(`${competency.score}%  |  ${plainBand(competency)}`, margin + 335, y + 1, { width: contentWidth(doc) - 335, align: 'right', lineBreak: false });
    doc.roundedRect(margin, y + 14, contentWidth(doc), 7, 3.5).fill(palette.track);
    if (competency.score > 0) doc.roundedRect(margin, y + 14, contentWidth(doc) * (competency.score / 100), 7, 3.5).fill(bandColor(competency));
    doc.y = y + 27;
  }
}

function focusLabel(kind: FocusArea['kind']) {
  if (kind === 'scenario') return 'SCENARIO DECISION';
  if (kind === 'balance') return 'USE WITH FLEXIBILITY';
  if (kind === 'growth') return 'BUILD THIS SIGNAL';
  return 'KEEP RESPONSES GROUNDED';
}

function focusColor(kind: FocusArea['kind']) {
  if (kind === 'scenario') return palette.violet;
  if (kind === 'balance') return palette.amber;
  if (kind === 'growth') return palette.coral;
  return palette.teal;
}

function focusBackground(kind: FocusArea['kind']) {
  if (kind === 'scenario') return palette.violetPale;
  if (kind === 'balance') return palette.amberPale;
  if (kind === 'growth') return palette.coralPale;
  return palette.tealPale;
}

function questionReference(area: FocusArea) {
  if (!area.questions.length) return '';
  const numbers = area.questions.map((item) => item.number).filter(Boolean);
  if (!numbers.length) return '';
  return `Review question${numbers.length === 1 ? '' : 's'} ${numbers.join(' and ')}.`;
}

function focusCardHeight(doc: Doc, area: FocusArea, width: number) {
  const innerWidth = width - 28;
  doc.font('Helvetica-Bold').fontSize(11.5);
  const titleHeight = doc.heightOfString(cleanText(area.title), { width: innerWidth, lineGap: 1.8 });
  doc.font('Helvetica').fontSize(9);
  const guidanceHeight = doc.heightOfString(cleanText(area.guidance), { width: innerWidth, lineGap: 2.4 });
  return 42 + titleHeight + guidanceHeight + (questionReference(area) ? 18 : 0);
}

function drawFocusCard(doc: Doc, area: FocusArea) {
  const width = contentWidth(doc);
  const height = focusCardHeight(doc, area, width);
  ensureSpace(doc, height + 12);
  const y = doc.y;
  const color = focusColor(area.kind);
  doc.roundedRect(margin, y, width, height, 10).fillAndStroke(focusBackground(area.kind), color);
  doc.roundedRect(margin, y, 6, height, 3).fill(color);
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor(color).text(focusLabel(area.kind), margin + 17, y + 12, { width: width - 30, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(palette.navy).text(cleanText(area.title), margin + 17, y + 27, { width: width - 30, lineGap: 1.8 });
  const guidanceY = doc.y + 5;
  doc.font('Helvetica').fontSize(9).fillColor(palette.ink).text(cleanText(area.guidance), margin + 17, guidanceY, { width: width - 30, lineGap: 2.4 });
  const questions = questionReference(area);
  if (questions) {
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(color).text(questions, margin + 17, y + height - 17, { width: width - 30, lineBreak: false });
  }
  doc.y = y + height + 12;
}

function drawStartHere(doc: Doc, focusAreas: FocusArea[]) {
  drawSectionTitle(doc, 'Start here on your next attempt', 'These are the clearest places to slow down, reflect, and practise again.');
  if (!focusAreas.length) {
    drawParagraph(doc, 'No single area stood out. Keep your next answers anchored in recent examples of what you usually do.');
    return;
  }
  drawFocusCard(doc, focusAreas[0]);
}

function drawDistribution(doc: Doc, result: AssessmentResult) {
  const sampled = result.competencies.filter((item) => item.opportunities > 0);
  const parts = [
    { band: 'possible_overuse' as const, label: 'Very high', help: 'Review balance', color: palette.amber },
    { band: 'strong' as const, label: 'Clear strength', help: 'Shows clearly', color: palette.teal },
    { band: 'balanced' as const, label: 'Balanced', help: 'Used with flexibility', color: palette.blue },
    { band: 'developing' as const, label: 'Less evident', help: 'Appeared less often', color: palette.coral },
  ].map((part) => ({ ...part, count: sampled.filter((item) => item.band === part.band).length }));
  ensureSpace(doc, 104);
  const y = doc.y;
  const width = contentWidth(doc);
  doc.roundedRect(margin, y, width, 96, 10).fillAndStroke(palette.soft, palette.line);
  const cx = margin + 49;
  const cy = y + 45;
  drawDonut(doc, cx, cy, 31, 18, parts.map((part) => ({ value: part.count, color: part.color })), palette.soft);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(palette.navy).text(String(sampled.length), cx - 15, cy - 8, { width: 30, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(6.2).fillColor(palette.muted).text('sampled', cx - 18, cy + 7, { width: 36, align: 'center', lineBreak: false });
  const legendX = margin + 98;
  const legendY = y + 17;
  const itemWidth = (width - 112) / 2;
  parts.forEach((part, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = legendX + itemWidth * column;
    const itemY = legendY + row * 29;
    doc.circle(itemX + 4, itemY + 5, 4).fill(part.color);
    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(palette.ink).text(`${part.count} ${part.label}`, itemX + 13, itemY, { width: itemWidth - 16, lineBreak: false });
    doc.font('Helvetica').fontSize(6.8).fillColor(palette.muted).text(part.help, itemX + 13, itemY + 11, { width: itemWidth - 16, lineBreak: false });
  });
  doc.font('Helvetica').fontSize(7.8).fillColor(palette.muted).text(
    `${sampled.length} of ${result.competencies.length} clusters sampled. ${result.competencies.length - sampled.length} were not sampled in this session.`,
    legendX, y + 77, { width: width - 112, lineBreak: false },
  );
  doc.y = y + 108;
}

function fittedFontSize(doc: Doc, text: string, width: number, start = 8.7, minimum = 7.2) {
  let size = start;
  doc.font('Helvetica-Bold').fontSize(size);
  while (size > minimum && doc.widthOfString(text) > width) {
    size -= 0.25;
    doc.fontSize(size);
  }
  return size;
}

function drawAllCompetencies(doc: Doc, result: AssessmentResult) {
  for (const competency of result.competencies) {
    ensureSpace(doc, 22);
    const y = doc.y;
    const name = cleanText(competency.name);
    const label = competency.opportunities ? `${competency.score}%  |  ${plainBand(competency)}` : 'Not sampled';
    const labelWidth = 148;
    const nameWidth = contentWidth(doc) - labelWidth - 8;
    const size = fittedFontSize(doc, name, nameWidth);
    doc.fillColor(palette.ink).text(name, margin, y, { width: nameWidth, lineBreak: false });
    doc.font('Helvetica').fontSize(7.6).fillColor(palette.muted).text(label, margin + nameWidth + 8, y + 1, { width: labelWidth, align: 'right', lineBreak: false });
    doc.roundedRect(margin, y + 12, contentWidth(doc), 5.5, 2.75).fill(palette.track);
    if (competency.opportunities && competency.score > 0) {
      doc.roundedRect(margin, y + 12, contentWidth(doc) * (competency.score / 100), 5.5, 2.75).fill(bandColor(competency));
    }
    doc.y = y + 22;
  }
}

function drawList(doc: Doc, values: string[], ordered = false) {
  values.forEach((raw, index) => {
    const value = cleanText(raw);
    doc.font('Helvetica').fontSize(9.3);
    const textWidth = contentWidth(doc) - 24;
    const height = doc.heightOfString(value, { width: textWidth, lineGap: 2.5 });
    ensureSpace(doc, height + 9);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(palette.tealDark).text(ordered ? `${index + 1}.` : '•', margin, y, { width: 18, lineBreak: false });
    doc.font('Helvetica').fontSize(9.3).fillColor(palette.ink).text(value, margin + 23, y, { width: textWidth, lineGap: 2.5 });
    doc.y = y + height + 9;
  });
}

function drawConsistencySection(doc: Doc, result: AssessmentResult) {
  drawSectionTitle(doc, 'How consistent were your answers?');
  const measured = result.consistency.evaluatedClusters > 0;
  const title = measured
    ? `${result.consistency.label} alignment at ${result.consistency.percentage}%`
    : 'Consistency was not measured in this session';
  const detail = measured
    ? `${cleanText(result.consistency.note)} The comparison used ${result.consistency.evaluatedClusters} repeated competency areas. One different answer is never treated as dishonesty.`
    : 'This session did not contain two answered questions from the same competency area. That is a sampling limitation, not evidence that your answers were inconsistent.';
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(palette.tealDark).text(title, margin, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.35);
  drawParagraph(doc, detail, { size: 9.2, lineGap: 2.6, gapAfter: 12 });
}

function drawScenarioSection(doc: Doc, result: AssessmentResult) {
  drawSectionTitle(doc, 'Scenario judgment');
  if (!result.scenarioJudgment.total) {
    drawParagraph(doc, 'No situational judgment questions were included in this session.', { color: palette.muted });
    return;
  }
  const y = doc.y;
  doc.roundedRect(margin, y, contentWidth(doc), 74, 10).fillAndStroke(palette.violetPale, palette.violet);
  const centreX = margin + 45;
  const centreY = y + 37;
  drawDonut(doc, centreX, centreY, 27, 16, [
    { value: result.scenarioJudgment.percentage, color: palette.violet },
    { value: 100 - result.scenarioJudgment.percentage, color: '#D8D1F2' },
  ], palette.violetPale);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(palette.violet).text(`${result.scenarioJudgment.percentage}%`, centreX - 16, centreY - 5, { width: 32, align: 'center', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.navy).text(
    `${result.scenarioJudgment.total} scenarios scored separately`, margin + 91, y + 13, { width: contentWidth(doc) - 107 },
  );
  doc.font('Helvetica').fontSize(8.7).fillColor(palette.ink).text(
    `You identified ${result.scenarioJudgment.weakestChoiceAligned} of ${result.scenarioJudgment.total} generic weakest actions. Review any scenario cards above for the exact questions that need another look.`,
    margin + 91, y + 32, { width: contentWidth(doc) - 107, lineGap: 2.2 },
  );
  doc.y = y + 88;
}

function drawCoaching(doc: Doc, coaching: Coaching) {
  addReportPage(doc);
  drawPageTitle(
    doc,
    'Your personalised coaching',
    'This section explains the measured results in plain English. It was included because you requested AI coaching before downloading the report.',
  );
  drawSectionTitle(doc, 'What the coach noticed');
  drawParagraph(doc, coaching.summary, { size: 10, lineGap: 3, gapAfter: 12 });
  drawSectionTitle(doc, 'Strengths to build on');
  drawList(doc, coaching.strengths);
  drawSectionTitle(doc, 'Practical coaching tips');
  drawList(doc, coaching.coachingTips);
  drawSectionTitle(doc, 'Your next practice plan');
  drawList(doc, coaching.practicePlan, true);
  drawSectionTitle(doc, 'For more consistent answers');
  drawParagraph(doc, coaching.consistencyCoaching, { size: 9.5, lineGap: 2.8 });
}

function drawFooters(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const y = doc.page.height - 35;
    doc.moveTo(margin, y - 8).lineTo(doc.page.width - margin, y - 8).lineWidth(0.6).strokeColor(palette.line).stroke();
    doc.font('Helvetica').fontSize(7.2).fillColor(palette.muted).text(
      'Personal practice only. Work-style tendencies are not right or wrong.',
      margin, y, { width: contentWidth(doc) - 70, lineBreak: false },
    );
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(palette.navy).text(
      `${pageIndex - range.start + 1} / ${range.count}`,
      doc.page.width - margin - 60, y, { width: 60, align: 'right', lineBreak: false },
    );
  }
}

export function createPdfReport(result: AssessmentResult, coaching?: Coaching) {
  const doc = new PDFDocument({
    size: 'A4',
    margin,
    bufferPages: true,
    info: {
      Title: 'Moby culture-fit practice report',
      Author: 'Moby',
      Subject: 'Personal assessment practice results and coaching plan',
    },
  });

  doc.rect(0, 0, doc.page.width, 138).fill(palette.navyDeep);
  doc.circle(doc.page.width - 28, 27, 87).fill(palette.tealDark);
  doc.circle(doc.page.width - 103, 115, 38).fill(palette.blue);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#91E3DA').text('MOBY  |  CULTURE-FIT PRACTICE', margin, 26, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(27).fillColor(palette.paper).text('Your practice report', margin, 48, { width: 390, lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor('#D5E5ED').text(
    'A clear view of your work-style patterns, scenario judgment, and next practice steps.',
    margin, 83, { width: 390, lineGap: 2.4 },
  );
  const completed = new Date(result.completedAt);
  const completedLabel = Number.isNaN(completed.getTime())
    ? cleanText(result.completedAt)
    : completed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  doc.font('Helvetica').fontSize(8).fillColor('#BFD3DE').text(`Completed ${completedLabel}`, margin, 116, { lineBreak: false });
  doc.y = 158;

  drawParagraph(
    doc,
    'Use this report as a map for practice. Work-style scores show which tendencies appeared in your choices. They are not right or wrong. Scenario judgment is scored separately because those questions compare the quality of workplace actions.',
    { size: 9.7, color: palette.ink, lineGap: 2.9, gapAfter: 14 },
  );
  drawMetricGrid(doc, result);
  drawSectionTitle(
    doc,
    'Your clearest signals',
    'Longer bars mean a tendency appeared more often in this session. A very high bar is a prompt to check balance, not a bad result.',
  );
  drawCompetencyChart(doc, keyCompetencies(result));
  drawStartHere(doc, result.focusAreas);

  addReportPage(doc);
  drawPageTitle(
    doc,
    'Complete competency profile',
    'This page shows every competency cluster in the bank. A grey bar means the cluster was not sampled in this session. Compare patterns across several attempts before drawing a firm conclusion.',
  );
  drawDistribution(doc, result);
  drawSectionTitle(doc, `All ${result.competencies.length} competency clusters`);
  drawAllCompetencies(doc, result);

  addReportPage(doc);
  drawPageTitle(
    doc,
    'Where to improve next',
    'These pointers come directly from your scored scenarios and repeated work-style patterns. Review the named questions, then answer again using a real example from your usual behaviour.',
  );
  if (result.focusAreas.length) {
    for (const area of result.focusAreas) drawFocusCard(doc, area);
  } else {
    drawParagraph(doc, 'No single focus area stood out. Keep practising with recent examples and a consistent view of your usual work behaviour.');
  }
  drawConsistencySection(doc, result);
  drawScenarioSection(doc, result);

  if (coaching) drawCoaching(doc, coaching);

  ensureSpace(doc, 48);
  drawParagraph(
    doc,
    cleanText(result.disclaimer || 'This report supports personal practice. It is not an employment decision or psychological diagnosis.'),
    { size: 8.2, color: palette.muted, font: 'Helvetica-Oblique', lineGap: 2.3, gapAfter: 0 },
  );
  drawFooters(doc);
  doc.end();
  return doc;
}

import * as XLSX from 'xlsx';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Quiz, Question } from '../types';
import { CORNERSTONE_SUBJECTS } from './cornerstoneSubjects';

// Builds the Cornerstone "Edge Import" workbook for a quiz:
//   Test-Worksheet, Question-Category-Worksheet, Questions-Mapping-Worksheet.
// Values are written as plain values (no formulas) so the file imports as-is.

// Allowed values below come from Cornerstone's LMS-Test Template Guide.

export type ProviderType = 'ILT' | 'ONLINE';
export const PROVIDER_TYPES: ProviderType[] = ['ILT', 'ONLINE'];

export const REVIEW_LEVELS = ['Questions Only', 'Question and Answers', 'Question Category and Answer'] as const;
export type ReviewLevel = typeof REVIEW_LEVELS[number];

// Recurrence is the sum of three checkboxes. Valid sums: 0, 1, 2, 3, 5, 6, 7
// (4 alone isn't allowed: "approve based on original approval" needs one of the other two).
export const RECURRENCE_ASSIGN = 1;   // Allow this training to be assigned to the same user more than once
export const RECURRENCE_REQUEST = 2;  // Allow users to request this training more than once
export const RECURRENCE_APPROVAL = 4; // Allow subsequent instances to be approved based on original approval
export const VALID_RECURRENCE = [0, 1, 2, 3, 5, 6, 7];

export interface CornerstoneExportOptions {
  testNumber: number;
  vendorProvider: string;   // Test-Worksheet "Vendor/Provider"
  providerType: ProviderType; // must match how the provider is set up in Cornerstone
  subject: string;          // Category Name from the subject list
  authorId: string;         // Cornerstone user ID written to the "Author" column
  attemptsAllowed: number | null; // null = blank cell = unlimited attempts
  recurrence: number;       // see RECURRENCE_* flags
  trainingHours: string;    // HHHH:MM:SS, e.g. "0000:05:00"
  reviewLevel: ReviewLevel;
  viewScoreManager: boolean;
  viewScoreUser: boolean;
  allowReviewManager: boolean;
  allowReviewUser: boolean;
  allowReviewEveryAttempt: boolean;
  parentCategoryId: string; // Question-Category-Worksheet "Parent Category Id"
  testInstructions: string; // Test-Worksheet "Test Instructions" (plain text, max 2000)
}

// Settings remembered between exports (test number and instructions are per quiz).
export const CORNERSTONE_DEFAULTS: Omit<CornerstoneExportOptions, 'testNumber' | 'testInstructions'> = {
  vendorProvider: 'Safety & Health',
  providerType: 'ILT',
  subject: 'Safety & Health',
  authorId: '134415',
  attemptsAllowed: 3,
  recurrence: RECURRENCE_ASSIGN + RECURRENCE_APPROVAL, // 5
  trainingHours: '0000:05:00',
  reviewLevel: 'Questions Only',
  viewScoreManager: true,
  viewScoreUser: true,
  allowReviewManager: true,
  allowReviewUser: true,
  allowReviewEveryAttempt: false,
  parentCategoryId: '29',
};

/** "0000:05:00" from hours and minutes. */
export function formatTrainingHours(hours: number, minutes: number): string {
  return `${String(hours).padStart(4, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

/** Hours and minutes from "HHHH:MM:SS"; falls back to the default (5 minutes) if unreadable. */
export function parseTrainingHours(value: string): { hours: number; minutes: number } {
  const m = /^(\d{1,6}):(\d{2}):(\d{2})$/.exec((value || '').trim());
  return m ? { hours: Number(m[1]), minutes: Number(m[2]) } : { hours: 0, minutes: 5 };
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

export const TEST_INSTRUCTIONS_MAX = 2000;

/** Plain text from an info block's Markdown: drops heading/emphasis/code markers and keeps link text. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')          // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // links -> link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                // headings
    .replace(/^\s{0,3}>\s?/gm, '')                     // blockquotes
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')                // bullets -> "- "
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                // bold
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1$2') // italics
    .replace(/~~(.+?)~~/g, '$1')                       // strikethrough
    .replace(/`([^`]+)`/g, '$1')                       // inline code
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text of the quiz's opening Information Block (the first item, if it's an info block), or null. */
export function getOpeningInstructions(quiz: Quiz): string | null {
  const first = quiz.questions[0];
  if (!first || first.type !== 'info') return null;
  const text = markdownToPlainText(first.content || '');
  return text || null;
}

export const SECTION_NAME_MAX = 2000;
export const SECTION_DESCRIPTION_MAX = 3500;

/** HTML for a Markdown info block, rendered the same way the quiz player shows it. */
export function markdownToHtml(md: string): string {
  if (!md.trim()) return '';
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkBreaks] }, md));
}

export interface QuizSection {
  number: number;
  name: string;        // Information Block title ('' if the section has no block)
  description: string; // Information Block content as HTML
  questions: Question[];
}

/**
 * Splits the quiz into Cornerstone test sections. The opening Information Block is the Test
 * Instructions, not a section. Each later Information Block starts a new section (title = Section
 * Name, content = Section Description) — except one that comes before any question in the current
 * section (e.g. right after the Instructions block), which names that section instead. If two blocks
 * are back to back, the first title is kept and the second block's content is added to the description.
 * Sections without questions (e.g. an Information Block at the very end) are dropped.
 */
export function getSections(quiz: Quiz): QuizSection[] {
  const items = quiz.questions;
  const start = items[0]?.type === 'info' ? 1 : 0;
  const drafts: { name: string; markdown: string[]; questions: Question[] }[] = [{ name: '', markdown: [], questions: [] }];
  for (const item of items.slice(start)) {
    let current = drafts[drafts.length - 1];
    if (item.type === 'info') {
      if (current.questions.length > 0) {
        current = { name: '', markdown: [], questions: [] };
        drafts.push(current);
      }
      if (!current.name) current.name = clean(item.text);
      if ((item.content || '').trim()) current.markdown.push(item.content || '');
    } else {
      current.questions.push(item);
    }
  }
  return drafts
    .filter(d => d.questions.length > 0)
    .map((d, i) => ({
      number: i + 1,
      name: d.name,
      description: markdownToHtml(d.markdown.join('\n\n')),
      questions: d.questions,
    }));
}

/** Generated instructions used when the quiz has no opening Information Block. */
export function generatedInstructions(quiz: Quiz, attemptsAllowed: number | null): string {
  const attemptsWord = attemptsAllowed === 1 ? 'attempt' : 'attempts';
  return attemptsAllowed === null
    ? `A quiz is required at the end of the curriculum. Workers completing the training must pass the quiz with a minimum of ${quiz.passingScore}%. ` +
      `There is no limit on the number of attempts. `
    : `A quiz is required at the end of the curriculum. Workers completing the training must pass the quiz with a minimum of ${quiz.passingScore}% within ${attemptsAllowed} ${attemptsWord}. ` +
      `If the user does not pass the curriculum within ${attemptsAllowed} ${attemptsWord}, the curriculum will be re-assigned to the worker, allowing the worker to re-watch the training modules before retaking the quiz. `;
}

/** Default Test Instructions: the opening Information Block, else the generated text. */
export function defaultTestInstructions(quiz: Quiz, attemptsAllowed: number | null): string {
  return getOpeningInstructions(quiz) ?? generatedInstructions(quiz, attemptsAllowed);
}

// Cornerstone supports up to 10 answers. Answer 1-4 sit before "Correct Answer"; Answer 5-10 sit
// after "Section Number" (the sample template omitted 5 and 6; they're placed before Answer 7).
export const CORNERSTONE_MAX_ANSWERS = 10;

const PLACEHOLDER_DESCRIPTION = 'Enter quiz description here...';

const clean = (s: string | undefined) =>
  (s || '').replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

// Blank values become truly empty cells (no empty-string cell), like an untouched Excel cell.
const toSheet = (rows: (string | number | null)[][]) =>
  XLSX.utils.aoa_to_sheet(rows.map(r => r.map(v => (v === '' ? null : v))));

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function getExportableQuestions(quiz: Quiz): Question[] {
  return quiz.questions.filter(q => q.type !== 'info');
}

/** Returns problems that would prevent a valid Cornerstone import. */
export function validateForCornerstone(quiz: Quiz): string[] {
  const errors: string[] = [];
  if (!clean(quiz.title)) errors.push('The quiz needs a title (used as the Cornerstone Topic).');
  const questions = getExportableQuestions(quiz);
  if (questions.length === 0) errors.push('The quiz has no questions to export.');
  const sections = getSections(quiz);
  const seenNames = new Set<string>();
  sections.forEach(s => {
    const label = s.name ? `Section ${s.number} ("${s.name.slice(0, 40)}")` : `Section ${s.number}`;
    if (s.name.length > SECTION_NAME_MAX) errors.push(`${label} name is over ${SECTION_NAME_MAX} characters.`);
    if (s.description.length > SECTION_DESCRIPTION_MAX) {
      errors.push(`${label} description is ${s.description.length} characters as HTML; Cornerstone allows at most ${SECTION_DESCRIPTION_MAX}.`);
    }
    if (s.name) {
      const key = s.name.toLowerCase();
      if (seenNames.has(key)) errors.push(`More than one section is named "${s.name}"; Cornerstone needs each section name to be unique.`);
      seenNames.add(key);
    }
  });
  questions.forEach((q, i) => {
    if (q.options.length > CORNERSTONE_MAX_ANSWERS) {
      errors.push(`Question ${i + 1} has ${q.options.length} answers; the Cornerstone template allows at most ${CORNERSTONE_MAX_ANSWERS}.`);
    }
    if (!q.options.some(o => o.isCorrect)) {
      errors.push(`Question ${i + 1} has no correct answer.`);
    }
  });
  return errors;
}

export function buildCornerstoneFilename(quiz: Quiz, testNumber: number): string {
  return `${testNumber}-${clean(quiz.title)}`;
}

/** Text values derived from the quiz and options, shared by validation and generation. */
function deriveFields(quiz: Quiz, opts: CornerstoneExportOptions) {
  const topic = clean(quiz.title);
  const categoryRef = topic.replace(/ /g, '');
  const testId = `${opts.subject} - ${topic}`;
  const testTitle = `${topic} - Quiz`;
  const refNumber = (i: number) => `${categoryRef}-${pad(opts.testNumber, 3)}-${pad(i, 2)}`;
  const description = clean(quiz.description) === PLACEHOLDER_DESCRIPTION ? '' : clean(quiz.description);
  // Strip control characters but keep line breaks (and the text exactly as entered otherwise).
  const instructions = (opts.testInstructions || '').replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
  return { topic, categoryRef, testId, testTitle, refNumber, description, instructions };
}

/** Checks the options against the Template Guide's limits. Returns problems (empty = OK). */
export function validateCornerstoneOptions(quiz: Quiz, opts: CornerstoneExportOptions): string[] {
  const errors: string[] = [];
  const f = deriveFields(quiz, opts);
  const maxLen = (label: string, value: string, max: number) => {
    if (value.length > max) errors.push(`${label} is ${value.length} characters; Cornerstone allows at most ${max}.`);
  };
  maxLen('Test ID ("Subject - Title")', f.testId, 100);
  maxLen('Test Title', f.testTitle, 500);
  maxLen('Question Reference Number', f.refNumber(0), 50);
  maxLen('Vendor/Provider', opts.vendorProvider, 100);
  maxLen('Test Description', f.description, 5000);
  maxLen('Test Instructions', f.instructions, TEST_INSTRUCTIONS_MAX);
  if (quiz.passingScore < 0 || quiz.passingScore > 100) errors.push('Passing Score must be between 0 and 100.');
  if (opts.attemptsAllowed !== null && opts.attemptsAllowed > 9999) errors.push('Attempts Allowed can be at most 9999.');
  if (!VALID_RECURRENCE.includes(opts.recurrence)) {
    errors.push('"Approve based on original approval" requires one of the other recurrence options.');
  }
  if (!/^\d{1,6}:[0-5]\d:[0-5]\d$/.test(opts.trainingHours)) errors.push('Training Hours must be in HHHH:MM:SS format.');
  return errors;
}

export function generateCornerstoneWorkbook(quiz: Quiz, opts: CornerstoneExportOptions): XLSX.WorkBook {
  const subject = CORNERSTONE_SUBJECTS.find(s => s.name === opts.subject);
  if (!subject) throw new Error(`Unknown subject: ${opts.subject}`);
  const { topic, categoryRef, testId, testTitle, refNumber, description, instructions } = deriveFields(quiz, opts);
  const questions = getExportableQuestions(quiz);

  // --- Test-Worksheet ---
  const testSheet = toSheet([
    [
      'Subject', 'Subject IDs', 'Test Number', 'Topic', 'Filename', 'Test Description', 'Test Instructions',
      'Test ID', 'Test Title', 'Question Reference Number', 'Vendor/Provider', 'Provider Type', 'Active',
      'Attempts Allowed', 'View Test Score - Manager', 'View Test Score - User', 'Allow Test Review - Manager',
      'Allow Test Review - User', 'Allow Review After Every Attempt', 'Passing Score Percentage', 'Recurrence',
      'Training Hours', 'Review Level',
    ],
    [
      subject.name, subject.id, opts.testNumber, topic, buildCornerstoneFilename(quiz, opts.testNumber),
      description, instructions, testId, testTitle, refNumber(0), opts.vendorProvider, opts.providerType, 'yes',
      opts.attemptsAllowed ?? '', yesNo(opts.viewScoreManager), yesNo(opts.viewScoreUser),
      yesNo(opts.allowReviewManager), yesNo(opts.allowReviewUser), yesNo(opts.allowReviewEveryAttempt),
      quiz.passingScore, opts.recurrence, opts.trainingHours, opts.reviewLevel,
    ],
  ]);
  testSheet['!cols'] = [21, 12, 12, 39, 40, 55, 65, 40, 40, 32, 24, 12, 8, 16, 24, 22, 26, 24, 30, 24, 12, 14, 16].map(wch => ({ wch }));

  // --- Question-Category-Worksheet ---
  const categorySheet = toSheet([
    ['Category Name', 'Category Ref', 'Active', 'Parent Category Id'],
    [topic, categoryRef, 'Y', opts.parentCategoryId],
  ]);
  categorySheet['!cols'] = [40, 40, 8, 18].map(wch => ({ wch }));

  // --- Questions-Mapping-Worksheet ---
  const mappingHeader = [
    'Test', 'Category Ref', 'Question Reference Number', 'Question Type', 'Question Text', 'Information Content',
    'Answer Explanation', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct Answer', 'Default Language',
    'Active', 'Randomize Answer Choices', '# of Answer Choices', 'All of the Above', 'None of the Above', 'Author',
    'Test ID', 'Order Number', 'Section Number', 'Section Name', 'Section Description', 'Answer 5', 'Answer 6',
    'Answer 7', 'Answer 8', 'Answer 9', 'Answer 10', 'Image Filename', 'Answer Coordinates', 'Apply partial scoring',
  ];
  const sectionOf = new Map<Question, QuizSection>();
  getSections(quiz).forEach(s => s.questions.forEach(q => sectionOf.set(q, s)));
  const mappingRows = questions.map((q, i) => {
    const section = sectionOf.get(q)!;
    const a = Array.from({ length: CORNERSTONE_MAX_ANSWERS }, (_, j) => clean(q.options[j]?.text));
    const correct = q.options
      .map((o, j) => (o.isCorrect ? j + 1 : null))
      .filter((n): n is number => n !== null);
    const correctCell: string | number = correct.length === 1 ? correct[0] : correct.join(';');
    const type = correct.length > 1 ? 'Multiple Choice / Multiple Answer' : 'Multiple Choice / Single Answer';
    return [
      topic, categoryRef, refNumber(i), type, clean(q.text), '', '',
      a[0], a[1], a[2], a[3], correctCell, '', 'yes', 'no', '', '', '', opts.authorId,
      testId, i + 1, section.number, section.name, section.description,
      a[4], a[5], a[6], a[7], a[8], a[9], '', '', '',
    ];
  });
  const mappingSheet = toSheet([mappingHeader, ...mappingRows]);
  mappingSheet['!cols'] = [30, 28, 32, 32, 70, 20, 20, 40, 40, 40, 40, 14, 16, 8, 24, 18, 16, 18, 10, 40, 12, 14, 30, 60, 40, 40, 40, 40, 40, 40, 16, 18, 20].map(wch => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, testSheet, 'Test-Worksheet');
  XLSX.utils.book_append_sheet(wb, categorySheet, 'Question-Category-Worksheet');
  XLSX.utils.book_append_sheet(wb, mappingSheet, 'Questions-Mapping-Worksheet');
  return wb;
}

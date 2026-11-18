import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { FileSpreadsheet, XCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import { Quiz } from '../types';
import { CORNERSTONE_SUBJECTS } from '../services/cornerstoneSubjects';
import { CORNERSTONE_PROVIDERS } from '../services/cornerstoneProviders';
import {
  CORNERSTONE_DEFAULTS,
  CornerstoneExportOptions,
  PROVIDER_TYPES,
  ProviderType,
  RECURRENCE_APPROVAL,
  RECURRENCE_ASSIGN,
  RECURRENCE_REQUEST,
  REVIEW_LEVELS,
  ReviewLevel,
  TEST_INSTRUCTIONS_MAX,
  buildCornerstoneFilename,
  defaultTestInstructions,
  formatTrainingHours,
  getOpeningInstructions,
  getSections,
  generateCornerstoneWorkbook,
  getExportableQuestions,
  parseTrainingHours,
  validateCornerstoneOptions,
  validateForCornerstone,
} from '../services/cornerstoneExport';

const SETTINGS_KEY = 'cornerstoneExportSettings';
const TEST_NUMBERS_KEY = 'cornerstoneTestNumbers';

type SavedSettings = typeof CORNERSTONE_DEFAULTS;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings just won't be remembered */
  }
}

// Providers whose names end in "-Online" are set up as ONLINE providers; others default to ILT.
const guessProviderType = (provider: string): ProviderType => (/-online$/i.test(provider) ? 'ONLINE' : 'ILT');

function Check({ id, checked, onChange, disabled, children }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className={`flex items-start gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-teal-600 shrink-0"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

interface Props {
  quiz: Quiz;
  onClose: () => void;
  onExported: (message: string) => void;
  onError: (message: string) => void;
}

export function CornerstoneExportModal({ quiz, onClose, onExported, onError }: Props) {
  const saved = readJson<SavedSettings>(SETTINGS_KEY, CORNERSTONE_DEFAULTS);
  const savedNumbers = readJson<Record<string, number>>(TEST_NUMBERS_KEY, {});
  const savedTime = parseTrainingHours(saved.trainingHours);

  const [testNumber, setTestNumber] = useState(savedNumbers[quiz.id] ? String(savedNumbers[quiz.id]) : '');
  const [vendorProvider, setVendorProvider] = useState(
    CORNERSTONE_PROVIDERS.includes(saved.vendorProvider) ? saved.vendorProvider : CORNERSTONE_DEFAULTS.vendorProvider
  );
  const [providerType, setProviderType] = useState<ProviderType>(
    PROVIDER_TYPES.includes(saved.providerType) ? saved.providerType : CORNERSTONE_DEFAULTS.providerType
  );
  const [subject, setSubject] = useState(
    CORNERSTONE_SUBJECTS.some(s => s.name === saved.subject) ? saved.subject : CORNERSTONE_DEFAULTS.subject
  );
  const [authorId, setAuthorId] = useState(saved.authorId);
  const [attempts, setAttempts] = useState(saved.attemptsAllowed == null ? '' : String(saved.attemptsAllowed));
  const [hours, setHours] = useState(String(savedTime.hours));
  const [minutes, setMinutes] = useState(String(savedTime.minutes));
  const [recurAssign, setRecurAssign] = useState((saved.recurrence & RECURRENCE_ASSIGN) !== 0);
  const [recurRequest, setRecurRequest] = useState((saved.recurrence & RECURRENCE_REQUEST) !== 0);
  const [recurApproval, setRecurApproval] = useState((saved.recurrence & RECURRENCE_APPROVAL) !== 0);
  const [reviewLevel, setReviewLevel] = useState<ReviewLevel>(
    REVIEW_LEVELS.includes(saved.reviewLevel) ? saved.reviewLevel : CORNERSTONE_DEFAULTS.reviewLevel
  );
  const [viewScoreManager, setViewScoreManager] = useState(saved.viewScoreManager);
  const [viewScoreUser, setViewScoreUser] = useState(saved.viewScoreUser);
  const [allowReviewManager, setAllowReviewManager] = useState(saved.allowReviewManager);
  const [allowReviewUser, setAllowReviewUser] = useState(saved.allowReviewUser);
  const [allowReviewEveryAttempt, setAllowReviewEveryAttempt] = useState(saved.allowReviewEveryAttempt);
  const [parentCategoryId, setParentCategoryId] = useState(saved.parentCategoryId);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // null = not edited, so the text follows the default (opening Information Block, or generated text).
  const [editedInstructions, setEditedInstructions] = useState<string | null>(null);
  const hasOpeningBlock = useMemo(() => getOpeningInstructions(quiz) !== null, [quiz]);

  const sortedSubjects = useMemo(
    () => [...CORNERSTONE_SUBJECTS].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const sortedProviders = useMemo(() => [...CORNERSTONE_PROVIDERS].sort((a, b) => a.localeCompare(b)), []);
  const quizErrors = useMemo(() => validateForCornerstone(quiz), [quiz]);
  const questionCount = getExportableQuestions(quiz).length;
  const sections = useMemo(() => getSections(quiz), [quiz]);

  // "Approve based on original approval" only applies when one of the other two is checked.
  const approvalAvailable = recurAssign || recurRequest;
  const recurrence =
    (recurAssign ? RECURRENCE_ASSIGN : 0) +
    (recurRequest ? RECURRENCE_REQUEST : 0) +
    (recurApproval && approvalAvailable ? RECURRENCE_APPROVAL : 0);

  const testNum = Number(testNumber);
  const attemptsNum = attempts.trim() === '' ? null : Number(attempts);
  const hoursNum = hours.trim() === '' ? 0 : Number(hours);
  const minutesNum = minutes.trim() === '' ? 0 : Number(minutes);

  const instructions =
    editedInstructions ?? defaultTestInstructions(quiz, attemptsNum !== null && attemptsNum >= 1 ? attemptsNum : null);

  const fieldErrors: string[] = [];
  if (!/^\d+$/.test(testNumber.trim()) || testNum < 1) fieldErrors.push('Enter a whole-number Test Number (1 or greater).');
  if (!authorId.trim()) fieldErrors.push('Enter an Author ID.');
  if (attemptsNum !== null && (!/^\d+$/.test(attempts.trim()) || attemptsNum < 1)) {
    fieldErrors.push('Attempts Allowed must be a whole number (1 or greater), or blank for unlimited.');
  }
  if (!/^\d{0,6}$/.test(hours.trim())) fieldErrors.push('Training hours must be a whole number (up to 6 digits).');
  if (!/^\d{0,2}$/.test(minutes.trim()) || minutesNum > 59) fieldErrors.push('Training minutes must be 0–59.');
  if (!parentCategoryId.trim()) fieldErrors.push('Enter a Parent Category Id.');

  const opts: CornerstoneExportOptions = {
    testNumber: testNum,
    vendorProvider,
    providerType,
    subject,
    authorId: authorId.trim(),
    attemptsAllowed: attemptsNum,
    recurrence,
    trainingHours: formatTrainingHours(hoursNum || 0, minutesNum || 0),
    reviewLevel,
    viewScoreManager,
    viewScoreUser,
    allowReviewManager,
    allowReviewUser,
    allowReviewEveryAttempt,
    parentCategoryId: parentCategoryId.trim(),
    testInstructions: instructions,
  };
  if (fieldErrors.length === 0) fieldErrors.push(...validateCornerstoneOptions(quiz, opts));

  const canExport = quizErrors.length === 0 && fieldErrors.length === 0;
  const fileName = `${buildCornerstoneFilename(quiz, testNum)}.xlsx`;

  const handleExport = () => {
    if (!canExport) return;
    try {
      const wb = generateCornerstoneWorkbook(quiz, opts);
      XLSX.writeFile(wb, fileName.replace(/[\\/:*?"<>|]/g, '_'));
      const { testNumber: _n, testInstructions: _i, ...rest } = opts;
      writeJson(SETTINGS_KEY, rest);
      writeJson(TEST_NUMBERS_KEY, { ...savedNumbers, [quiz.id]: testNum });
      onExported(`Exported ${questionCount} question${questionCount === 1 ? '' : 's'} for Cornerstone Edge Import.`);
      onClose();
    } catch (err) {
      console.error('Cornerstone export error:', err);
      onError('Failed to export the Cornerstone XLSX. Check console for details.');
    }
  };

  const inputClass =
    'w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 bg-white';
  const labelClass = 'text-sm font-medium text-slate-700';
  const hintClass = 'text-[10px] text-slate-400 leading-tight';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="cornerstone-export-title"
      >
        <form
          className="p-8 space-y-5"
          onSubmit={e => {
            e.preventDefault();
            handleExport();
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 text-teal-700 rounded-xl">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h2 id="cornerstone-export-title" className="text-xl font-bold text-slate-800">Export for Cornerstone</h2>
                <p className="text-sm text-slate-500">Creates an XLSX for Cornerstone Edge Import.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400" aria-label="Close">
              <XCircle size={24} />
            </button>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-600 space-y-1">
            <div><strong>Topic:</strong> {quiz.title || '(untitled)'}</div>
            <div>
              <strong>Questions:</strong> {questionCount} &nbsp; <strong>Sections:</strong> {sections.length} &nbsp;{' '}
              <strong>Passing score:</strong> {quiz.passingScore}%
            </div>
            {sections.some(s => s.name) && (
              <ol className="list-decimal list-inside text-slate-500">
                {sections.map(s => (
                  <li key={s.number}>{s.name || '(unnamed)'} – {s.questions.length} question{s.questions.length === 1 ? '' : 's'}</li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="cs-test-number" className={labelClass}>Test Number <span className="text-red-500">*</span></label>
            <input
              id="cs-test-number"
              autoFocus
              inputMode="numeric"
              className={inputClass}
              placeholder="e.g. 2"
              value={testNumber}
              onChange={e => setTestNumber(e.target.value)}
            />
            <p className={hintClass}>Serial number for this test. Used in the filename and question reference numbers.</p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div className="space-y-2 min-w-0">
              <label htmlFor="cs-provider" className={labelClass}>Vendor/Provider</label>
              <select
                id="cs-provider"
                className={inputClass}
                value={vendorProvider}
                onChange={e => {
                  setVendorProvider(e.target.value);
                  setProviderType(guessProviderType(e.target.value));
                }}
              >
                {sortedProviders.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="cs-provider-type" className={labelClass}>Provider Type</label>
              <select id="cs-provider-type" className={inputClass} value={providerType} onChange={e => setProviderType(e.target.value as ProviderType)}>
                {PROVIDER_TYPES.map(t => (
                  <option key={t} value={t}>{t === 'ILT' ? 'ILT' : 'Online'}</option>
                ))}
              </select>
            </div>
          </div>
          <p className={`${hintClass} -mt-3`}>Provider Type must match how the provider is set up in Cornerstone.</p>

          <div className="space-y-2">
            <label htmlFor="cs-subject" className={labelClass}>Subject</label>
            <select id="cs-subject" className={inputClass} value={subject} onChange={e => setSubject(e.target.value)}>
              {sortedSubjects.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="cs-author" className={labelClass}>Author ID</label>
              <input id="cs-author" className={inputClass} value={authorId} onChange={e => setAuthorId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="cs-attempts" className={labelClass}>Attempts Allowed</label>
              <input id="cs-attempts" inputMode="numeric" className={inputClass} placeholder="Unlimited" value={attempts} onChange={e => setAttempts(e.target.value)} />
              <p className={hintClass}>Leave blank for unlimited attempts.</p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelClass}>Training Time</legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input id="cs-hours" inputMode="numeric" aria-label="Training hours" className={inputClass} value={hours} onChange={e => setHours(e.target.value)} />
                <span className="text-sm text-slate-500">hours</span>
              </div>
              <div className="flex items-center gap-2">
                <input id="cs-minutes" inputMode="numeric" aria-label="Training minutes" className={inputClass} value={minutes} onChange={e => setMinutes(e.target.value)} />
                <span className="text-sm text-slate-500">minutes</span>
              </div>
            </div>
            <p className={hintClass}>Used for reporting. Exported as {opts.trainingHours}.</p>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="cs-instructions" className={labelClass}>Test Instructions</label>
              {editedInstructions !== null && (
                <button
                  type="button"
                  onClick={() => setEditedInstructions(null)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              id="cs-instructions"
              rows={6}
              className={`${inputClass} text-sm resize-y`}
              value={instructions}
              onChange={e => setEditedInstructions(e.target.value)}
            />
            <div className="flex justify-between gap-4">
              <p className={hintClass}>
                {hasOpeningBlock
                  ? 'Default comes from the quiz\'s opening Information Block.'
                  : 'The quiz has no opening Information Block, so default text was generated.'}
              </p>
              <p className={`text-[10px] shrink-0 ${instructions.length > TEST_INSTRUCTIONS_MAX ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                {instructions.length}/{TEST_INSTRUCTIONS_MAX}
              </p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelClass}>Recurrence</legend>
            <Check id="cs-recur-assign" checked={recurAssign} onChange={setRecurAssign}>
              Allow this training to be assigned to the same user more than once
            </Check>
            <Check id="cs-recur-request" checked={recurRequest} onChange={setRecurRequest}>
              Allow users to request this training more than once
            </Check>
            <Check id="cs-recur-approval" checked={recurApproval} onChange={setRecurApproval} disabled={!approvalAvailable}>
              Allow subsequent instances to be approved based on the original approval
              {!approvalAvailable && <span className="block text-[10px]">Requires one of the options above.</span>}
            </Check>
          </fieldset>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
              aria-expanded={showAdvanced}
            >
              <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="cs-review-level" className={labelClass}>Review Level</label>
                  <select id="cs-review-level" className={inputClass} value={reviewLevel} onChange={e => setReviewLevel(e.target.value as ReviewLevel)}>
                    {REVIEW_LEVELS.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <p className={hintClass}>What users and managers see when reviewing a completed test.</p>
                </div>

                <fieldset className="space-y-2">
                  <legend className={labelClass}>Scores and Review</legend>
                  <Check id="cs-score-mgr" checked={viewScoreManager} onChange={setViewScoreManager}>Managers can view the test score</Check>
                  <Check id="cs-score-user" checked={viewScoreUser} onChange={setViewScoreUser}>Users can view their test score</Check>
                  <Check id="cs-review-mgr" checked={allowReviewManager} onChange={setAllowReviewManager}>Managers can review the test</Check>
                  <Check id="cs-review-user" checked={allowReviewUser} onChange={setAllowReviewUser}>Users can review their test</Check>
                  <Check id="cs-review-every" checked={allowReviewEveryAttempt} onChange={setAllowReviewEveryAttempt}>Allow review after every attempt</Check>
                </fieldset>

                <div className="space-y-2">
                  <label htmlFor="cs-parent" className={labelClass}>Parent Category Id</label>
                  <input id="cs-parent" className={inputClass} value={parentCategoryId} onChange={e => setParentCategoryId(e.target.value)} />
                  <p className={hintClass}>Question category the new quiz category is created under.</p>
                </div>
              </div>
            )}
          </div>

          {(quizErrors.length > 0 || (testNumber && fieldErrors.length > 0)) && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-800 space-y-1" role="alert">
              {[...quizErrors, ...(testNumber ? fieldErrors : [])].map(err => (
                <div key={err} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-px" /> {err}</div>
              ))}
            </div>
          )}

          {canExport && (
            <p className="text-xs text-slate-500">File: <strong>{fileName}</strong></p>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canExport}
              className="px-8 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export XLSX
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

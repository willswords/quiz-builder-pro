import { Quiz } from '../types';
import type { OpenResult, RecentQuiz } from '../electron';

// Quizzes are saved to and loaded from `.quiz` files on this computer.
// In the desktop app this goes through Electron (native Save/Open dialogs);
// in a plain browser (npm run dev) it falls back to download / file-picker.

export type { RecentQuiz };
export type OpenedQuiz = { path: string | null; quiz: Quiz };

const api = () => window.quizApi;

function cleanObject<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function withTimestamps(quiz: Quiz): Quiz {
  const now = new Date().toISOString();
  return cleanObject({ ...quiz, createdAt: quiz.createdAt || now, updatedAt: now });
}

function unwrap(text: string): Quiz {
  const obj = JSON.parse(text);
  const quiz = obj && obj.quiz ? obj.quiz : obj;
  if (!quiz || !Array.isArray(quiz.questions)) throw new Error('This file is not a valid quiz file.');
  return quiz;
}

function toOpened(result: OpenResult): OpenedQuiz | null {
  if (!result) return null;
  if ('error' in result) throw new Error(result.error);
  return { path: result.path, quiz: result.quiz };
}

function browserDownload(quiz: Quiz) {
  const body = JSON.stringify({ app: 'QuizBuilder Pro', formatVersion: 1, quiz }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(quiz.title || 'Quiz').replace(/[\\/:*?"<>|]+/g, '')}.quiz`;
  a.click();
  URL.revokeObjectURL(url);
}

function browserPick(): Promise<OpenedQuiz | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.quiz,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve({ path: null, quiz: unwrap(await file.text()) }); } catch (e) { reject(e); }
    };
    input.click();
  });
}

export const quizService = {
  /** Save to an existing path. Returns that path. */
  async saveQuiz(quiz: Quiz, filePath: string): Promise<string> {
    const a = api();
    if (!a) { browserDownload(withTimestamps(quiz)); return filePath; }
    return (await a.saveQuiz(filePath, withTimestamps(quiz))).path;
  },

  /** Ask where to save. Returns the chosen path, or null if cancelled. */
  async saveQuizAs(quiz: Quiz): Promise<string | null> {
    const a = api();
    const stamped = withTimestamps(quiz);
    if (!a) { browserDownload(stamped); return null; }
    const res = await a.saveQuizAs(stamped, quiz.title || 'Quiz');
    return res ? res.path : null;
  },

  /** Show the Open dialog. Returns null if cancelled; throws on a bad file. */
  async openQuiz(): Promise<OpenedQuiz | null> {
    const a = api();
    return a ? toOpened(await a.openQuiz()) : browserPick();
  },

  async openQuizPath(filePath: string): Promise<OpenedQuiz | null> {
    const a = api();
    return a ? toOpened(await a.openQuizPath(filePath)) : null;
  },

  async getRecent(): Promise<RecentQuiz[]> {
    return api()?.getRecent() ?? [];
  },

  async removeRecent(filePath: string): Promise<void> {
    await api()?.removeRecent(filePath);
  },

  /** A quiz file passed to the app at launch (double-click / "Open with"). */
  async getPendingOpen(): Promise<OpenedQuiz | null> {
    const a = api();
    return a ? toOpened(await a.getPendingOpen()) : null;
  },

  /** A quiz file opened while the app is already running. */
  onOpenedExternally(cb: (result: OpenedQuiz | null, error?: string) => void): () => void {
    const a = api();
    if (!a) return () => {};
    return a.onOpened((res) => {
      try { cb(toOpened(res)); } catch (e: any) { cb(null, e?.message || 'Could not open the file.'); }
    });
  },

  setDirty(dirty: boolean) { api()?.setDirty(dirty); },
  setTitle(title: string) { api()?.setTitle(title); },
};

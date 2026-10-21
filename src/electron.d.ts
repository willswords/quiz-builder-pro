import type { Quiz, MediaItem } from './types';

export interface RecentQuiz {
  path: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

export type OpenResult = { path: string; quiz: Quiz } | { error: string } | null;

export interface QuizApi {
  saveQuiz(filePath: string, quiz: Quiz): Promise<{ path: string }>;
  saveQuizAs(quiz: Quiz, suggestedName: string): Promise<{ path: string } | null>;
  openQuiz(): Promise<OpenResult>;
  openQuizPath(filePath: string): Promise<OpenResult>;
  getRecent(): Promise<RecentQuiz[]>;
  removeRecent(filePath: string): Promise<boolean>;
  getPendingOpen(): Promise<OpenResult>;
  onOpened(cb: (result: OpenResult) => void): () => void;
  setDirty(dirty: boolean): void;
  setTitle(title: string): void;
  loadMedia(): Promise<MediaItem[]>;
  saveMedia(items: MediaItem[]): Promise<boolean>;
}

declare global {
  interface Window {
    quizApi?: QuizApi;
  }
}

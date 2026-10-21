import { v4 as uuidv4 } from 'uuid';
import { MediaItem } from '../types';

// The media library lives on this computer (a file in the app's data folder).
// Media is embedded into a quiz as base64 when you select it, so .quiz files stay self-contained.

const LS_KEY = 'quizbuilder_media_library';
const listeners = new Set<(media: MediaItem[]) => void>();
let cache: MediaItem[] | null = null;

async function load(): Promise<MediaItem[]> {
  if (cache) return cache;
  try {
    if (window.quizApi) {
      cache = await window.quizApi.loadMedia();
    } else {
      cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    }
  } catch {
    cache = [];
  }
  return cache!;
}

async function persist(items: MediaItem[]) {
  cache = items;
  if (window.quizApi) await window.quizApi.saveMedia(items);
  else localStorage.setItem(LS_KEY, JSON.stringify(items));
  listeners.forEach(cb => cb([...items]));
}

export const mediaService = {
  async uploadMedia(file: File, base64Data: string): Promise<string> {
    const items = await load();
    const now = new Date().toISOString();
    const item: MediaItem = {
      id: uuidv4(),
      name: file.name,
      type: file.type,
      size: file.size,
      url: base64Data,
      userId: 'local',
      createdAt: now,
      updatedAt: now,
    };
    await persist([item, ...items]);
    return item.id;
  },

  subscribeToMedia(callback: (media: MediaItem[]) => void) {
    listeners.add(callback);
    load().then(items => callback([...items]));
    return () => { listeners.delete(callback); };
  },

  async deleteMedia(mediaId: string): Promise<void> {
    const items = await load();
    await persist(items.filter(m => m.id !== mediaId));
  },
};

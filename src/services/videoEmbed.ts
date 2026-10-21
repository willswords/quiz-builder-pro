import { MediaAsset, Quiz } from '../types';

// Turns a YouTube / Vimeo page link (watch, share, shorts, embed...) into an embeddable player URL.
// Returns null for anything else (direct video files, uploaded/base64 videos), which use a <video> tag.
export function getEmbedUrl(rawUrl: string): string | null {
  const url = (rawUrl || '').trim();
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();

  // YouTube
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id: string | null = null;
    if (host === 'youtu.be') {
      id = u.pathname.split('/')[1] || null;
    } else if (u.pathname === '/watch') {
      id = u.searchParams.get('v');
    } else {
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{6,})/);
      if (m) id = m[2];
    }
    if (!id) return null;

    const params = new URLSearchParams({ rel: '0' });
    const t = u.searchParams.get('start') || u.searchParams.get('t');
    if (t) {
      const secs = /^\d+$/.test(t)
        ? Number(t)
        : (() => {
            const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
            return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
          })();
      if (secs > 0) params.set('start', String(secs));
    }
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:\/video)?\/(\d+)(?:\/([a-f0-9]+))?/i);
    if (!m) return null;
    const h = m[2] || u.searchParams.get('h');
    return `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ''}`;
  }

  return null;
}

// Media saved as a plain 'video' with a YouTube/Vimeo link becomes an embedded player ('youtube' type).
export function normalizeMedia(media: MediaAsset | undefined): MediaAsset | undefined {
  if (!media || media.type === 'image') return media;
  const embed = getEmbedUrl(media.url);
  return embed ? { ...media, type: 'youtube', url: embed } : media;
}

export function withEmbeddedMedia(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map(q => (q.media ? { ...q, media: normalizeMedia(q.media) } : q)),
  };
}

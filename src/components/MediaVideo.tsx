import React from 'react';
import { MediaAsset } from '../types';
import { normalizeMedia } from '../services/videoEmbed';

interface MediaVideoProps {
  media: MediaAsset;
  className?: string; // used for the plain <video> case
}

// Plays an uploaded/direct video file, or embeds YouTube / Vimeo links in a 16:9 player.
export const MediaVideo: React.FC<MediaVideoProps> = ({ media, className = 'max-w-full h-auto max-h-[300px]' }) => {
  const m = normalizeMedia(media) || media;

  if (m.type === 'youtube') {
    return (
      <div className="w-full" style={{ aspectRatio: '16 / 9', maxWidth: 720, margin: '0 auto' }}>
        <iframe
          src={m.url}
          title="Embedded video"
          className="w-full h-full block border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return <video src={m.url} controls className={className} />;
};

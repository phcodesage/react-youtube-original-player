"use client";

import { useRef, useState } from 'react';
// In an installed app, import from 'react-youtube-original-player'.
import { ResolvedYouTubePlayer, type OriginalPlayerHandle } from '../src';

export default function MediaPlayer() {
  const player = useRef<OriginalPlayerHandle>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  return <div>
    <ResolvedYouTubePlayer
      ref={player}
      src="https://www.youtube.com/watch?v=8TT2-kwAss0"
      endpoint="/api/original"
      playing={playing}
      playbackSpeed={playbackSpeed}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onStart={() => console.log('started')}
      onEnd={() => setPlaying(false)}
      onTimeUpdate={() => console.log(player.current?.currentTime)}
      onSeeked={() => console.log('seeked', player.current?.paused)}
      onPlaybackSpeedChange={(actual) => console.log('accepted rate', actual)}
      onResolveError={(error) => console.error(error.message)}
      onError={(event) => console.error(event.currentTarget.error)}
    />
    <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
    <button onClick={() => {
      if (player.current) player.current.currentTime += 10;
    }}>Skip ahead 10 seconds</button>
    <button onClick={() => setPlaybackSpeed((speed) => Math.min(1.5, Number((speed + 0.1).toFixed(1))))}>Speed up</button>
    <button onClick={() => setPlaybackSpeed((speed) => Math.max(0.5, Number((speed - 0.1).toFixed(1))))}>Slow down</button>
  </div>;
}

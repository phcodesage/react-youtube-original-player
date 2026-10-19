import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OriginalYouTubePlayer, ResolvedYouTubePlayer, getYouTubeVideoId, type OriginalPlayerHandle, type OriginalYouTubePlayerProps, type ResolvedOriginalVideo } from '../src';
import './style.css';

function App() {
  const player = useRef<OriginalPlayerHandle>(null);
  const [mode, setMode] = useState<'resolved' | 'youtube' | 'source'>(new URLSearchParams(location.search).has('source') ? 'source' : new URLSearchParams(location.search).has('embed') ? 'youtube' : 'resolved');
  const [resolution, setResolution] = useState<ResolvedOriginalVideo>();
  const [src, setSrc] = useState(() => {
    try { return `https://www.youtube.com/watch?v=${getYouTubeVideoId(new URLSearchParams(location.search).get('video') ?? '8TT2-kwAss0')}`; }
    catch { return 'https://www.youtube.com/watch?v=8TT2-kwAss0'; }
  });
  const [draft, setDraft] = useState(src);
  const [source, setSource] = useState('/fixture.mp4');
  const [sourceDraft, setSourceDraft] = useState(source);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('es');
  const [strict, setStrict] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [actualSpeed, setActualSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState('5');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const log = (name: string) => setEvents((old) => [`${name}  ·  ${(player.current?.currentTime ?? 0).toFixed(2)}s`, ...old].slice(0, 12));
  const switchMode = (next: typeof mode) => {
    setMode(next); setPlaying(false); setEvents([]); setTime(0); setDuration(0); setActualSpeed(1); setError(''); setResolution(undefined);
  };
  const playerKey = `${mode}:${src}:${source}:${language}:${strict}`;
  const playerProps: OriginalYouTubePlayerProps & { ref: typeof player } = {
    ref: player,
    src, originalTitle: title || undefined, originalLanguage: language || undefined,
    originalSource: mode === 'source' ? source : undefined,
    requireOriginalAudio: strict, playing, playbackSpeed: speed,
    muted: new URLSearchParams(location.search).has('test'),
    onPlay: () => { setPlaying(true); log('onPlay'); },
    onStart: () => log('onStart'),
    onPause: () => { setPlaying(false); log('onPause'); },
    onEnd: () => { setPlaying(false); log('onEnd'); },
    onSeeked: () => log('onSeeked'),
    onReady: () => { setDuration(player.current?.duration ?? 0); log('onReady'); },
    onTimeUpdate: () => setTime(player.current?.currentTime ?? 0),
    onPlaybackSpeedChange: (value) => { setActualSpeed(value); log('onRateChange'); },
    onPlaybackError: (e) => setError(e.message),
    onError: () => setError('The video could not load. Check the source, stream expiry, or server network access.'),
  };

  return <main>
    <nav><a className="brand" href="/" aria-label="Original Player home"><span className="brand-mark">▷</span> ORIGINAL<span className="muted"> / PLAYER</span></a><span className="version">MIT LICENSE · v0.2.0</span></nav>
    <header><p className="eyebrow">ORIGINAL AUDIO. ORIGINAL TITLE.</p><h1>Keep the voice.<br /><span>Keep the context.</span></h1><p className="intro">Paste a YouTube URL. The backend selects the audio marked original and streams it with the original title. One audio track. No extension.</p></header>
    <div className="workspace">
      <section className="playback-panel" aria-label="Video workbench">
        <div className="tabs" role="group" aria-label="Playback mode">
          <button className={mode === 'resolved' ? 'active' : ''} aria-pressed={mode === 'resolved'} onClick={() => switchMode('resolved')}>Original stream</button>
          <button className={mode === 'youtube' ? 'active' : ''} aria-pressed={mode === 'youtube'} onClick={() => switchMode('youtube')}>01 / YouTube embed</button>
          <button className={mode === 'source' ? 'active' : ''} aria-pressed={mode === 'source'} onClick={() => switchMode('source')}>02 / Supplied source</button>
        </div>
        <div className="player-shell">
          <div className="player-label"><span className="live-dot" /> {mode === 'resolved' ? 'ORIGINAL HLS STREAM' : mode === 'youtube' ? 'YOUTUBE IFRAME' : 'NATIVE VIDEO'}<span>{mode === 'resolved' ? resolution?.language ?? '—' : language || '—'}</span></div>
          {mode === 'resolved'
            ? <ResolvedYouTubePlayer key={playerKey} {...playerProps} onResolved={setResolution} onResolveError={(e) => setError(e.message)} />
            : <OriginalYouTubePlayer key={playerKey} {...playerProps} />}
        </div>
        <div className="transport"><button className="primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button><button onClick={() => player.current?.seekTo(Math.max(0, time - 10))}>−10s</button><button onClick={() => player.current?.seekTo(time + 10)}>+10s</button><output aria-label="Current time">{time.toFixed(1)} <span>/ {Number.isFinite(duration) ? duration.toFixed(1) : '—'}s</span></output></div>
        <div className="adjustments"><label>Playback speed<select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.5, 0.75, 1, 1.1, 1.25, 1.5].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label><label>Seek to (seconds)<div className="inline"><input aria-label="Seek to seconds" type="number" min="0" value={seek} onChange={(e) => setSeek(e.target.value)} /><button onClick={() => { const seconds = Number(seek); if (Number.isFinite(seconds) && seconds >= 0) player.current?.seekTo(seconds); }}>Seek</button></div></label></div>
        <p className="speed-note">Actual rate: <output aria-label="Actual playback speed">{actualSpeed}×</output>. {mode === 'youtube' ? 'YouTube may round unsupported rates toward 1×.' : 'Playback speed applies to the original media stream.'}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <aside>
        <section className="card capability"><p className="eyebrow">AUDIO CONTROL</p><h2>{mode === 'resolved' ? 'Only the original track.' : mode === 'source' ? 'Your source. Your audio.' : strict ? 'Original audio required.' : 'YouTube is in control.'}</h2><span className={`badge ${mode !== 'youtube' ? 'green' : ''}`}>{mode === 'resolved' ? resolution ? 'ORIGINAL TRACK SELECTED' : 'RESOLVING ORIGINAL TRACK' : mode === 'source' ? 'SUPPLIED MEDIA' : strict ? 'PLAYBACK BLOCKED' : 'ORIGINAL AUDIO UNVERIFIED'}</span><p>{mode === 'resolved' ? resolution ? `${resolution.selection.audioLabel}. The server exposes this track alone; dubbed alternatives are excluded.` : 'The backend looks for YouTube’s explicit original-track metadata. It fails if the original cannot be identified.' : mode === 'source' ? 'Plays the asset you supply. The included synthetic clip has no speech; replace it with your original-language media.' : 'The public iframe API cannot select or verify an original audio track. A language hint is not an audio guarantee.'}</p></section>
        <section className="card config"><h2>Configure the player</h2>
          <form onSubmit={(e) => { e.preventDefault(); try { getYouTubeVideoId(draft); setError(''); setResolution(undefined); setSrc(draft); setPlaying(false); } catch { setError('Enter a valid YouTube video URL.'); } }}><label>YouTube URL<input value={draft} onChange={(e) => setDraft(e.target.value)} /></label><button type="submit">Load video ↗</button></form>
          {mode === 'source' && <form onSubmit={(e) => {
            e.preventDefault();
            try {
              const url = new URL(sourceDraft, location.origin);
              if (!['http:', 'https:', 'blob:'].includes(url.protocol) || /(^|\.)youtube(?:-nocookie)?\.com$|(^|\.)youtu\.be$/.test(url.hostname)) throw new Error();
              setSource(url.href); setPlaying(false); setError('');
            } catch { setError('Enter a direct media URL using HTTP, HTTPS, or blob.'); }
          }}><label>Original media URL<input aria-label="Original media URL" value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)} /></label><button type="submit">Load source ↗</button></form>}
          {mode !== 'resolved' && <>
            <label>Original title<input value={title} placeholder="Paste the creator’s original title" onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Original language<select value={language} onChange={(e) => { setLanguage(e.target.value); setPlaying(false); }}><option value="es">Spanish · es</option><option value="en">English · en</option><option value="ja">Japanese · ja</option><option value="fr">French · fr</option><option value="de">German · de</option><option value="">No language hint</option></select></label>
            <label className="checkbox"><input type="checkbox" checked={strict} onChange={(e) => { setStrict(e.target.checked); setPlaying(false); }} /> Require original audio</label>
          </>}
          <p className="small">{mode === 'resolved' ? 'Title and language come from the server automatically. This mode requires the Node relay and yt-dlp.' : 'This blocks YouTube playback without a supplied source. Original titles appear above the video; YouTube controls its own overlay.'}</p>
        </section>
      </aside>
      <section className="card event-card"><div className="section-heading"><h2>Playback events</h2><span className="small">onTimeUpdate → {time.toFixed(1)}s</span></div><div className="events" aria-label="Playback events">{events.length ? events.map((event, i) => <div key={`${i}:${event}`}><span>{String(events.length - i).padStart(2, '0')}</span><code>{event}</code></div>) : <p>Play or seek a video to inspect its events.</p>}</div></section>
      <section className="card code-card"><p className="eyebrow">A SMALL REACT API</p><pre><code>{`<ResolvedYouTubePlayer\n  ref={player}\n  src={youtubeUrl}\n  endpoint="/api/original"\n  playing={playing}\n  playbackSpeed={1.25}\n  onTimeUpdate={updateTime}\n  onSeeked={handleSeeked}\n/>\n\nplayer.current.seekTo(30);`}</code></pre></section>
    </div>
    <footer><span>Built on ReactPlayer 3. Open source under MIT.</span><span>Original track selection happens on the server.</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

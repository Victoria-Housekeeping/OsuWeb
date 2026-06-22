import { useState, useEffect, useRef } from 'react';
import { Beatmap, GameSettings, PlayStats, MapGroup } from './types';
import { BeatmapSelector } from './components/BeatmapSelector';
import { GameCanvas } from './components/GameCanvas';
import { ScoreScreen } from './components/ScoreScreen';
import { IntroAndStartScreen } from './components/IntroAndStartScreen';

export default function App() {
  const [view, setView] = useState<'intro_and_start' | 'selector' | 'playing' | 'score'>('intro_and_start');
  const [activeBeatmap, setActiveBeatmap] = useState<Beatmap | null>(null);
  const [activeAudioBuffer, setActiveAudioBuffer] = useState<AudioBuffer | null>(null);
  
  const [mapGroups, setMapGroups] = useState<MapGroup[]>([]);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number>(0);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number>(0);

  const DEFAULT_SETTINGS: GameSettings = {
    gameMode: 'standard',
    autoPlay: false,
    touchControls: true, // default to true so visual tapping zones are visible for tablet players
    hitsounds: true,
    volume: 0.6,
    dimLevel: 60,
    useKeyboard: true,
    disableClicking: false,
    showFps: false,
    uiScale: 1.0,
    autoScaleField: true,
    audioOffset: 0,
    enableReplays: true,
    skinPreset: 'lazer',
  };

  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem('osu_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings', e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('osu_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }, [settings]);

  const [lastPlayStats, setLastPlayStats] = useState<PlayStats | null>(null);
  const [spectatingReplayName, setSpectatingReplayName] = useState<string | null>(null);
  const [originalAutoPlayState, setOriginalAutoPlayState] = useState<boolean>(false);

  // Background music (BGM) playback references
  const [trianglesBuffer, setTrianglesBuffer] = useState<AudioBuffer | null>(null);
  const [isLoadingTriangles, setIsLoadingTriangles] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const currentBgmIdRef = useRef<string | null>(null);

  // Stops BGM completely
  const stopBgm = () => {
    if (bgmSourceRef.current) {
      try {
        bgmSourceRef.current.stop();
      } catch (err) {
        // safe ignore
      }
      try {
        bgmSourceRef.current.disconnect();
      } catch (err) {
        // safe ignore
      }
      bgmSourceRef.current = null;
    }
    currentBgmIdRef.current = null;
  };

  // Triggers seamless loopable bgm
  const playBgm = (bgmId: string, buffer: AudioBuffer | null, baseVolume: number = 0.35) => {
    if (!audioCtxRef.current || !buffer) return;

    // Prevent re-triggering the exact same track from the start
    if (currentBgmIdRef.current === bgmId && bgmSourceRef.current) {
      if (bgmGainRef.current) {
        bgmGainRef.current.gain.value = baseVolume;
      }
      return;
    }

    try {
      stopBgm();

      const actx = audioCtxRef.current;
      if (actx.state === 'suspended') {
        actx.resume();
      }

      const source = actx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = actx.createGain();
      gain.gain.value = baseVolume;

      source.connect(gain);
      gain.connect(actx.destination);

      source.start(0);

      bgmSourceRef.current = source;
      bgmGainRef.current = gain;
      currentBgmIdRef.current = bgmId;
    } catch (err) {
      console.warn('Error starting BGM playback:', err);
    }
  };

  // Background Music Manager logic loop
  useEffect(() => {
    // 1. If currently in gameplay, stop any menu BGM immediately
    if (view === 'playing') {
      stopBgm();
      return;
    }

    // 2. If in intro flow, we only play the triangles theme inside the start step
    if (view === 'intro_and_start') {
      return;
    }

    // 3. Songs Selection BGM
    const activeGroup = mapGroups[selectedGroupIdx];
    const activeVersion = activeGroup?.versions[selectedVersionIdx];

    let isCancelled = false;

    if (activeVersion) {
      const loadAndPreview = async () => {
        try {
          if (!audioCtxRef.current) return;
          const actx = audioCtxRef.current;

          let audioBufferToPlay: AudioBuffer;

          if (activeVersion.id === 'built-in-synthwave-tutorial') {
            const { generateAudioBufferForBeatmap } = await import('./utils/audioSynth');
            audioBufferToPlay = await generateAudioBufferForBeatmap();
          } else if (activeVersion.audioBlob) {
            const arrayBuffer = await activeVersion.audioBlob.arrayBuffer();
            audioBufferToPlay = await actx.decodeAudioData(arrayBuffer);
          } else {
            // fallback
            if (trianglesBuffer && !isCancelled) {
              playBgm('triangles', trianglesBuffer, settings.volume * 0.45);
            }
            return;
          }

          if (!isCancelled) {
            playBgm(activeVersion.id, audioBufferToPlay, settings.volume * 0.4);
          }
        } catch (err) {
          console.warn('Could not decode preview music, falling back to Triangles BGM...', err);
          if (!isCancelled && trianglesBuffer) {
            playBgm('triangles', trianglesBuffer, settings.volume * 0.45);
          }
        }
      };

      loadAndPreview();

      return () => {
        isCancelled = true;
      };
    } else {
      // List of imported beatmaps is empty - play "Triangles" theme as the beautiful standard menu theme!
      if (trianglesBuffer) {
        playBgm('triangles', trianglesBuffer, settings.volume * 0.45);
      }
    }
  }, [view, selectedGroupIdx, selectedVersionIdx, mapGroups, trianglesBuffer, settings.volume]);

  // Initializes user gesture Web Audio context and loads/decodes BGM resources
  const handleInitAudioContext = async () => {
    setIsLoadingTriangles(true);
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const actx = audioCtxRef.current;
      if (actx.state === 'suspended') {
        await actx.resume();
      }

      if (trianglesBuffer) {
        setIsLoadingTriangles(false);
        return { actx, buffer: trianglesBuffer };
      }

      let decoded: AudioBuffer | null = null;
      try {
        const response = await fetch('./cYsmix - Triangles_320k.mp3');
        if (response.ok) {
          const arrBuffer = await response.arrayBuffer();
          if (arrBuffer.byteLength > 100) {
            decoded = await actx.decodeAudioData(arrBuffer);
          }
        }
      } catch (err) {
        console.warn('Local Triangles MP3 not loaded/found, using synthesized fallback...', err);
      }

      if (!decoded) {
        const { generateProceduralTrianglesTheme } = await import('./utils/audioSynth');
        decoded = await generateProceduralTrianglesTheme();
      }

      setTrianglesBuffer(decoded);
      setIsLoadingTriangles(false);
      return { actx, buffer: decoded };
    } catch (err) {
      console.error('AudioContext / BGM initialization error:', err);
      let actx = audioCtxRef.current;
      if (!actx) {
        actx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = actx;
      }
      setIsLoadingTriangles(false);
      return { actx, buffer: null };
    }
  };

  const handleStartIntro = (
    actx: AudioContext,
    buffer: AudioBuffer | null,
    runningSource?: AudioBufferSourceNode,
    runningGain?: GainNode
  ) => {
    audioCtxRef.current = actx;
    if (buffer) {
      setTrianglesBuffer(buffer);
    }
    
    // Stop the running intro background music source completely as requested
    if (runningSource) {
      try {
        runningSource.stop();
        runningSource.disconnect();
      } catch (err) {
        console.warn('Failed to stop running intro source:', err);
      }
    }
    
    stopBgm();
    setView('selector');
  };

  const handleSelectBeatmap = (beatmap: Beatmap, audioBuffer: AudioBuffer) => {
    setActiveBeatmap(beatmap);
    setActiveAudioBuffer(audioBuffer);
    setView('playing');
  };

  const handleSelectReplay = (beatmap: Beatmap, audioBuffer: AudioBuffer, playerName: string) => {
    setOriginalAutoPlayState(settings.autoPlay);
    setSettings(prev => ({ ...prev, autoPlay: true }));
    setSpectatingReplayName(playerName);
    setActiveBeatmap(beatmap);
    setActiveAudioBuffer(audioBuffer);
    setView('playing');
  };

  const handleGameFinish = (stats: PlayStats) => {
    if (spectatingReplayName !== null) {
      setSettings(prev => ({ ...prev, autoPlay: originalAutoPlayState }));
      setSpectatingReplayName(null);
    }
    setLastPlayStats(stats);
    setView('score');
  };

  const handleRetry = () => {
    if (spectatingReplayName !== null) {
      setSettings(prev => ({ ...prev, autoPlay: true }));
    }
    setView('playing');
  };

  const handleHome = () => {
    if (spectatingReplayName !== null) {
      setSettings(prev => ({ ...prev, autoPlay: originalAutoPlayState }));
      setSpectatingReplayName(null);
    }
    setView('selector');
  };

  return (
    <div className="absolute inset-0 bg-[#06060c] select-none text-white overflow-hidden">
      {(view === 'selector' || view === 'intro_and_start') && (
        <BeatmapSelector
          onSelect={handleSelectBeatmap}
          onSelectReplay={handleSelectReplay}
          settings={settings}
          onUpdateSettings={setSettings}
          mapGroups={mapGroups}
          setMapGroups={setMapGroups}
          selectedGroupIdx={selectedGroupIdx}
          setSelectedGroupIdx={setSelectedGroupIdx}
          selectedVersionIdx={selectedVersionIdx}
          setSelectedVersionIdx={setSelectedVersionIdx}
        />
      )}

      {view === 'intro_and_start' && (
        <IntroAndStartScreen
          onStart={handleStartIntro}
          trianglesBuffer={trianglesBuffer}
          isLoadingAudio={isLoadingTriangles}
          onInitAudioContext={handleInitAudioContext}
        />
      )}

      {view === 'playing' && activeBeatmap && (
        <GameCanvas
          beatmap={activeBeatmap}
          audioBuffer={activeAudioBuffer}
          settings={settings}
          onClose={handleHome}
          onFinish={handleGameFinish}
          spectatingReplayName={spectatingReplayName}
        />
      )}

      {view === 'score' && activeBeatmap && lastPlayStats && (
        <ScoreScreen
          beatmap={activeBeatmap}
          stats={lastPlayStats}
          onRetry={handleRetry}
          onHome={handleHome}
        />
      )}
    </div>
  );
}

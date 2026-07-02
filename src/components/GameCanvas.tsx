import React, { useEffect, useRef, useState } from 'react';
import { Beatmap, HitObject, GameSettings, PlayStats } from '../types';
import { Volume2, VolumeX, RotateCcw, X, Play, Pause, Square } from 'lucide-react';

interface GameCanvasProps {
  beatmap: Beatmap;
  audioBuffer: AudioBuffer | null;
  settings: GameSettings;
  onClose: () => void;
  onFinish: (stats: PlayStats) => void;
  spectatingReplayName?: string | null;
}

interface FloatingHitResult {
  x: number;
  y: number;
  result: 300 | 100 | 50 | 0; // 0 = miss
  timestamp: number;
  id: string;
}

interface TouchTrail {
  id: string;
  x: number;
  y: number;
  timestamp: number;
}

interface HitBurst {
  id: string;
  x: number;
  y: number;
  color: string;
  timestamp: number;
  result: number;
}

const tintCache = new Map<string, HTMLCanvasElement>();

function getTintedCanvas(img: HTMLImageElement, color: string): HTMLCanvasElement | null {
  if (img.dataset.loaded !== 'true') {
    return null;
  }
  const cacheKey = `${img.src}_${color}`;
  if (tintCache.has(cacheKey)) {
    return tintCache.get(cacheKey)!;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 128;
  canvas.height = img.naturalHeight || img.height || 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
  }
  
  tintCache.set(cacheKey, canvas);
  return canvas;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  beatmap,
  audioBuffer,
  settings,
  onClose,
  onFinish,
  spectatingReplayName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Audio nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Timing & Game Loops
  const isPlayingRef = useRef<boolean>(true);
  const [isPlayingState, setIsPlayingState] = useState(true);
  const [isFailed, setIsFailed] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isPausedMenuOpen, setIsPausedMenuOpen] = useState(false);
  
  const startTimeRef = useRef<number>(0); // system timestamp corresponding to audio start
  const playheadMsRef = useRef<number>(0); // current duration in ms
  const pausedTimeMsRef = useRef<number>(0); // stored duration when paused

  // Game state
  const statsRef = useRef<PlayStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    hp: 100,
    hits300: 0,
    hits100: 0,
    hits50: 0,
    misses: 0,
  });

  const hitObjectsStateRef = useRef<HitObject[]>([]);
  const floatersRef = useRef<FloatingHitResult[]>([]);
  const trailsRef = useRef<TouchTrail[]>([]);
  const burstsRef = useRef<HitBurst[]>([]);
  const loadedCustomSkinImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const lastFrameTimeRef = useRef<number>(0);
  const activeManiaKeysRef = useRef<boolean[]>([false, false, false, false]);
  const activeDesktopKeysRef = useRef({
    k1: false,
    k2: false,
    m1: false,
    m2: false,
  });

  // Spinner states
  const spinnerSpinsRef = useRef<number>(0);
  const lastSpinnerAngleRef = useRef<number | null>(null);
  const spinnerTargetGoalRef = useRef<number>(1);
  const [spinnerProgress, setSpinnerProgress] = useState<number | null>(null);

  // Colors
  const defaultComboColors = beatmap.colors && beatmap.colors.length > 0
    ? beatmap.colors
    : [
        'rgb(236, 72, 153)',  // Neon Pink
        'rgb(6, 182, 212)',   // Electric Cyan
        'rgb(234, 179, 8)',   // Neon Yellow
        'rgb(34, 197, 94)',   // Acid Green
      ];

  const lazer2018ComboColors = [
    'rgb(180, 255, 50)',  // Acid Green
    'rgb(0, 255, 255)',   // Cyan
    'rgb(255, 0, 255)',   // Magenta
    'rgb(255, 255, 0)',   // Yellow
    'rgb(255, 173, 0)',   // Orange
    'rgb(0, 255, 0)',     // Green
    'rgb(255, 0, 0)',     // Red
    'rgb(255, 255, 255)', // White
  ];

  const comboColors = (settings.skinPreset === 'lazer2018' || settings.skinPreset === 'yada!' || settings.skinPreset === 'yara!' || !settings.skinPreset)
    ? lazer2018ComboColors
    : (settings.customSkinColors && settings.customSkinColors.comboColors && settings.customSkinColors.comboColors.length > 0
        ? settings.customSkinColors.comboColors
        : (beatmap.colors && beatmap.colors.length > 0 ? beatmap.colors : defaultComboColors));

  // Map settings
  const circleSize = beatmap.circleSize;
  const hpDrain = beatmap.hpDrain;
  const approachRate = beatmap.approachRate;
  const overallDifficulty = beatmap.overallDifficulty;

  // Compute OSU standard sizes
  // Circle size (CS) formula. Standard circles have diameter in range [20, 80] osu pixels.
  // Playfield width is 512, height is 384.
  const baseCSSize = (109 - 9 * circleSize) * 0.7; // diameter on standard size
  
  // Hit windows based on OD (leniency for web/touch)
  const leniency = settings.touchControls ? 50 : 25;
  const hit300Window = 80 - 6 * overallDifficulty + leniency;
  const hit100Window = 140 - 8 * overallDifficulty + leniency;
  const hit50Window = 200 - 10 * overallDifficulty + leniency;

  // Approach time (Preempt) in ms based on AR
  const approachDuration = approachRate < 5 
    ? 1200 + 600 * (5 - approachRate) / 5 
    : 1200 - 150 * (approachRate - 5) / 5;

  // Hitsounds
  const playHitSound = (type: 'hit' | 'slidertick' | 'miss') => {
    if (!settings.hitsounds || !audioCtxRef.current) return;
    try {
      const actx = audioCtxRef.current;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      
      if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, actx.currentTime + 0.04);
        gain.gain.setValueAtTime(settings.volume * 0.45, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.08);
      } else if (type === 'slidertick') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, actx.currentTime);
        gain.gain.setValueAtTime(settings.volume * 0.3, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.03);
      } else {
        // Miss sound: short buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, actx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, actx.currentTime + 0.15);
        gain.gain.setValueAtTime(settings.volume * 0.25, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15);
      }

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      osc.stop(actx.currentTime + 0.2);
    } catch (e) {
      // Ignored
    }
  };

  // Load custom skin images whenever the skin preset changes
  useEffect(() => {
    let active = true;

    const loadSkin = async () => {
      if (settings.skinPreset === 'lazer2018' || settings.skinPreset === 'yada!' || settings.skinPreset === 'yara!' || !settings.skinPreset) {
        const newLoadedImages: Record<string, HTMLImageElement> = {};
        const skinDir = 'OSU! Lazer 2018.406.0 by DP05';
        const filesToLoad: Record<string, string> = {
          cursorUrl: `./${skinDir}/cursor.png`,
          hitcircleUrl: `./${skinDir}/hitcircle.png`,
          hitcircleoverlayUrl: `./${skinDir}/hitcircleoverlay.png`,
          approachcircleUrl: `./${skinDir}/approachcircle.png`,
          sliderbUrl: `./${skinDir}/sliderb.png`,
          sliderfollowcircleUrl: `./${skinDir}/sliderfollowcircle.png`,
          reversearrowUrl: `./${skinDir}/reversearrow.png`,
          sliderendcircleUrl: `./${skinDir}/sliderendcircle.png`,
          sliderendcircleoverlayUrl: `./${skinDir}/sliderendcircleoverlay.png`,
          hit0Url: `./${skinDir}/hit0.png`,
          hit50Url: `./${skinDir}/hit50.png`,
          hit100Url: `./${skinDir}/hit100.png`,
          hit300Url: `./${skinDir}/hit300.png`,
          'scorebar-bgUrl': `./${skinDir}/scorebar-bg.png`,
          'scorebar-colourUrl': `./${skinDir}/scorebar-colour.png`,
          'pause-continueUrl': `./${skinDir}/pause-continue.png`,
          'pause-retryUrl': `./${skinDir}/pause-retry.png`,
          'pause-backUrl': `./${skinDir}/pause-back.png`
        };

        for (let i = 0; i <= 9; i++) {
          filesToLoad[`score-${i}Url`] = `./${skinDir}/score-${i}.png`;
        }
        filesToLoad['score-dotUrl'] = `./${skinDir}/score-dot.png`;
        filesToLoad['score-percentUrl'] = `./${skinDir}/score-percent.png`;
        filesToLoad['score-commaUrl'] = `./${skinDir}/score-comma.png`;

        const loadPromises = Object.entries(filesToLoad).map(([key, url]) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                img.dataset.loaded = 'true';
              } else {
                img.dataset.loaded = 'false';
              }
              resolve();
            };
            img.onerror = () => {
              img.dataset.loaded = 'false';
              resolve();
            };
            img.src = url;
            newLoadedImages[key] = img;
          });
        });
        await Promise.all(loadPromises);
        if (active) {
          loadedCustomSkinImagesRef.current = newLoadedImages;
        }
      } else if (settings.skinPreset && settings.skinPreset !== 'custom') {
        // Load the skin images from IndexedDB based on skinPreset (which stores the skin's name)!
        try {
          const { getAllKompliSkins } = await import('../utils/db');
          const skins = await getAllKompliSkins();
          const found = skins.find(s => s.name === settings.skinPreset);
          if (found && found.data && found.data.customSkinImages) {
            const newLoadedImages: Record<string, HTMLImageElement> = {};
            const loadPromises = Object.entries(found.data.customSkinImages).map(([key, url]) => {
              if (typeof url === 'string') {
                return new Promise<void>((resolve) => {
                  const img = new Image();
                  img.onload = () => {
                    img.dataset.loaded = 'true';
                    resolve();
                  };
                  img.onerror = () => {
                    img.dataset.loaded = 'false';
                    resolve();
                  };
                  img.src = url;
                  newLoadedImages[key] = img;
                });
              }
              return Promise.resolve();
            });
            await Promise.all(loadPromises);
            if (active) {
              loadedCustomSkinImagesRef.current = newLoadedImages;
            }
          } else {
            if (active) loadedCustomSkinImagesRef.current = {};
          }
        } catch (err) {
          console.error('Failed to load Kompli-Skin inside GameCanvas:', err);
          if (active) loadedCustomSkinImagesRef.current = {};
        }
      } else if (settings.skinPreset === 'custom' && settings.customSkinImages) {
        const newLoadedImages: Record<string, HTMLImageElement> = {};
        const loadPromises = Object.entries(settings.customSkinImages).map(([key, url]) => {
          if (typeof url === 'string') {
            return new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                img.dataset.loaded = 'true';
                resolve();
              };
              img.onerror = () => {
                img.dataset.loaded = 'false';
                resolve();
              };
              img.src = url;
              newLoadedImages[key] = img;
            });
          }
          return Promise.resolve();
        });
        await Promise.all(loadPromises);
        if (active) {
          loadedCustomSkinImagesRef.current = newLoadedImages;
        }
      } else {
        if (active) loadedCustomSkinImagesRef.current = {};
      }
    };

    loadSkin();

    return () => {
      active = false;
    };
  }, [settings.skinPreset, settings.customSkinImages]);

  // Setup game
  useEffect(() => {
    let active = true;

    // Clone hit objects to maintain hit state
    hitObjectsStateRef.current = beatmap.hitObjects.map(obj => ({
      ...obj,
      isHit: false,
      hitResult: null,
      activeTicksClicked: [],
    }));

    // Initialize Audio
    initAudio();

    // Resize canvas
    resize();
    window.addEventListener('resize', resize);

    // Keyboard bindings
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      
      if (keyLower === 'escape') {
        if (settings.useFullSkin) {
          setIsPausedMenuOpen(prev => !prev);
          handleTogglePlay();
        }
        return;
      }
      
      if (settings.gameMode === 'mania') {
        let lane = -1;
        if (keyLower === 'd') lane = 0;
        if (keyLower === 'f') lane = 1;
        if (keyLower === 'j') lane = 2;
        if (keyLower === 'k') lane = 3;
        
        if (lane !== -1 && !activeManiaKeysRef.current[lane]) {
          activeManiaKeysRef.current[lane] = true;
          triggerManiaHit(lane);
        }
        return;
      }

      if (settings.useKeyboard || settings.disableClicking) {
        if (keyLower === 'z' || keyLower === 'y') {
          activeDesktopKeysRef.current.k1 = true;
          if (isPlayingRef.current && mousePosRef.current) {
            triggerClick(mousePosRef.current.x, mousePosRef.current.y);
          }
        } else if (keyLower === 'x' || keyLower === 'c') {
          activeDesktopKeysRef.current.k2 = true;
          if (isPlayingRef.current && mousePosRef.current) {
            triggerClick(mousePosRef.current.x, mousePosRef.current.y);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      if (settings.gameMode === 'mania') {
        if (keyLower === 'd') activeManiaKeysRef.current[0] = false;
        if (keyLower === 'f') activeManiaKeysRef.current[1] = false;
        if (keyLower === 'j') activeManiaKeysRef.current[2] = false;
        if (keyLower === 'k') activeManiaKeysRef.current[3] = false;
        return;
      }
      if (keyLower === 'z' || keyLower === 'y') {
        activeDesktopKeysRef.current.k1 = false;
      } else if (keyLower === 'x' || keyLower === 'c') {
        activeDesktopKeysRef.current.k2 = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Main animation loop
    let animId: number;
    const loop = (timestamp: number) => {
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;
      const dt = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      updateGame(dt);
      renderGame();

      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animId);
      cleanupAudio();
    };
  }, [beatmap, audioBuffer]);

  const mousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Handle aborting/quitting
  const handleClose = () => {
    const wasPlaying = isPlayingState;
    document.title = wasPlaying ? '⏹️yada!' : '⏏️yada!';
    setTimeout(() => {
      // Reset title to plain standard
      document.title = 'yada!';
    }, 350);
    onClose();
  };

  const initAudio = async () => {
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') {
        const resume = () => {
          audioCtxRef.current?.resume();
          window.removeEventListener('click', resume);
          window.removeEventListener('touchend', resume);
        };
        window.addEventListener('click', resume);
        window.addEventListener('touchend', resume);
      }
      
      playAudioTrack();
    } catch (error) {
      console.error('Audio initialization error:', error);
    }
  };

  const playAudioTrack = () => {
    if (!audioCtxRef.current || !audioBuffer) return;

    try {
      // Stop old source
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      }

      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;

      const gain = audioCtxRef.current.createGain();
      gain.gain.value = settings.volume;

      source.connect(gain);
      gain.connect(audioCtxRef.current.destination);

      sourceNodeRef.current = source;
      gainNodeRef.current = gain;

      // Start play from exact saved ms duration
      const offsetSec = pausedTimeMsRef.current / 1000;
      source.start(0, offsetSec);
      
      // Calculate precise absolute timeline match
      startTimeRef.current = audioCtxRef.current.currentTime - offsetSec;
      isPlayingRef.current = true;
      setIsPlayingState(true);
      document.title = '▶️yada!';

      if (videoRef.current) {
        videoRef.current.currentTime = offsetSec;
        videoRef.current.play().catch(e => console.log('Video sync play failed:', e));
      }
    } catch (error) {
      console.error('Failed to play audio buffer source:', error);
    }
  };

  const stopAudioTrack = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (err) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlayingState(false);

    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const cleanupAudio = () => {
    stopAudioTrack();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const handleTogglePlay = () => {
    if (isFailed || isFinished) return;
    
    if (isPlayingState) {
      // Pause
      pausedTimeMsRef.current = playheadMsRef.current;
      stopAudioTrack();
      document.title = '⏸️yada!';
    } else {
      // Resume
      playAudioTrack();
      document.title = '▶️yada!';
    }
  };

  const handleRestart = () => {
    const wasPlaying = isPlayingState;
    document.title = wasPlaying ? '🔁yada!' : '🔂yada!';
    setTimeout(() => {
      // Restore standard playing title after 6 sec, if we are still playing
      if (document.title.includes('yada!')) {
         document.title = '▶️yada!';
      }
    }, 6000);

    // Reset state
    setIsFailed(false);
    setIsFinished(false);
    const initStats = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      hits300: 0,
      hits100: 0,
      hits50: 0,
      misses: 0,
    };
    statsRef.current = initStats;
    updateStats(initStats);
    playheadMsRef.current = 0;
    pausedTimeMsRef.current = 0;
    floatersRef.current = [];
    trailsRef.current = [];
    spinnerSpinsRef.current = 0;
    setSpinnerProgress(null);
    
    hitObjectsStateRef.current = beatmap.hitObjects.map(obj => ({
      ...obj,
      isHit: false,
      hitResult: null,
      activeTicksClicked: [],
    }));

    playAudioTrack();
  };

  const resize = () => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  };

  // Global screen-to-OSUpixels coordinate transform multipliers
  const getTransforms = (canvasWidth: number, canvasHeight: number) => {
    // osu! coords: 512x384
    const osuW = 512;
    const osuH = 384;
    
    const uiScale = settings.uiScale !== undefined ? settings.uiScale : 1.0;
    const autoScaleField = settings.autoScaleField !== false; // Default to true if undefined
    
    // Fit maintaining ratio with extra boundary margin
    const marginY = settings.useFullSkin ? 60 : 120;
    const marginX = settings.useFullSkin ? 60 : 100;
    const baseScale = Math.min((canvasWidth - marginX) / osuW, (canvasHeight - marginY) / osuH);
    const scale = autoScaleField ? baseScale : (baseScale * uiScale);
    const offsetX = (canvasWidth - osuW * scale) / 2;
    const offsetY = settings.useFullSkin ? (canvasHeight - osuH * scale) / 2 : (canvasHeight + 10 - osuH * scale) / 2;

    return { scale, offsetX, offsetY };
  };

  const updateGame = (dt: number) => {
    if (!isPlayingRef.current || isFailed || isFinished) return;

    // Track precise current time using Web Audio timeline with latency offset compensation
    if (audioCtxRef.current && isPlayingRef.current) {
      const curTime = audioCtxRef.current.currentTime;
      playheadMsRef.current = (curTime - startTimeRef.current) * 1000 + (settings.audioOffset || 0);
    }

    const playhead = playheadMsRef.current;

    // Sync background video if present
    if (videoRef.current && isPlayingRef.current) {
      const vid = videoRef.current;
      const expectedSec = playhead / 1000;
      const drift = Math.abs(vid.currentTime - expectedSec);
      if (drift > 0.15) {
        vid.currentTime = expectedSec;
      }
      if (vid.paused && !isFinished && !isFailed) {
        vid.play().catch(e => {});
      }
    }

    // Check passive HP Drain (osu! drain over time)
    // Reduce health incrementally, but only during active sections
    const curStats = statsRef.current;
    const isBreakTime = hitObjectsStateRef.current.every(obj => playhead < obj.time - 3000 || playhead > (obj.endTime || obj.time) + 1000);
    const passiveHpReduction = isBreakTime ? 0 : (hpDrain * 0.0025) * (dt / 16.6); // heavily reduced drain
    let newHp = settings.autoPlay ? 100 : curStats.hp - passiveHpReduction;
    
    // Auto Play automation!
    if (settings.autoPlay) {
      hitObjectsStateRef.current.forEach(obj => {
        if (!obj.isHit && obj.hitResult === null) {
          // Autoplay hits exactly on target time
          if (playhead >= obj.time) {
            triggerHit(obj, 300);
          }
        }
      });
    }

    // Process misses for missed hitcircles
    hitObjectsStateRef.current.forEach(obj => {
      if (!obj.isHit && obj.hitResult === null) {
        const isSliderHolding = obj.type === 'slider' && playhead >= obj.time && playhead <= (obj.endTime || obj.time);
        const isSpinnerActive = obj.type === 'spinner' && playhead <= (obj.endTime || obj.time);
        
        // If playhead surpasses the hit envelope frame
        const endTime = obj.endTime || obj.time;
        if (playhead > endTime + hit50Window && !isSliderHolding && !isSpinnerActive) {
          triggerHit(obj, 0); // Miss!
        }
      }
    });

    // Update floating score widgets
    floatersRef.current = floatersRef.current.filter(f => playhead - f.timestamp < 600);

    // Update swipe trails (touch indicators)
    trailsRef.current = trailsRef.current.filter(t => Date.now() - t.timestamp < 400);

    // Apply cap to health limits
    newHp = Math.max(0, Math.min(100, newHp));
    
    if (newHp <= 0 && !settings.autoPlay) {
      setIsFailed(true);
      stopAudioTrack();
    }

    // Check game completion
    const lastObject = beatmap.hitObjects[beatmap.hitObjects.length - 1];
    const mapEndTime = lastObject ? (lastObject.endTime || lastObject.time) : beatmap.duration;
    
    if (playhead >= mapEndTime + 1500) {
      setIsFinished(true);
      stopAudioTrack();
      onFinish(statsRef.current);
    }

    // Update live reactive state for health bar
    if (newHp !== curStats.hp) {
      updateStats({ hp: newHp });
    }
  };

  const updateStats = (diff: Partial<PlayStats>) => {
    const updated = { ...statsRef.current, ...diff };
    statsRef.current = updated;
    
    const hpBar = document.getElementById('hud-hp-bar');
    if (hpBar) {
      hpBar.style.width = `${updated.hp}%`;
      hpBar.className = `h-full transition-all duration-75 shadow-[0_0_10px_rgba(0,232,255,0.8)] ${
        updated.hp < 30 
          ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_14px_rgba(239,68,68,0.95)] animate-pulse' 
          : 'bg-gradient-to-r from-[#00CFFF] via-[#00E8FF] to-[#33EFFF]'
      }`;
    }

    const accuracyEl = document.getElementById('hud-accuracy');
    if (accuracyEl) {
      const totalHits = updated.hits300 + updated.hits100 + updated.hits50 + updated.misses;
      let acc = 100;
      if (totalHits > 0) {
        const actual = updated.hits300 * 300 + updated.hits100 * 100 + updated.hits50 * 50;
        acc = (actual / (totalHits * 300)) * 100;
      }
      accuracyEl.innerText = `${acc.toFixed(2)}%`;
    }

    const scoreEl = document.getElementById('hud-score');
    if (scoreEl) {
      const scoreStr = updated.score.toString().padStart(8, '0');
      const firstNonZero = scoreStr.search(/[1-9]/);
      let leading = '';
      let active = '';
      if (firstNonZero === -1) {
        leading = scoreStr;
      } else {
        leading = scoreStr.slice(0, firstNonZero);
        active = scoreStr.slice(firstNonZero);
      }
      
      const leadingEl = document.getElementById('hud-score-leading');
      const activeEl = document.getElementById('hud-score-active');
      if (leadingEl) leadingEl.textContent = leading;
      if (activeEl) activeEl.textContent = active;
    }

    const comboEl = document.getElementById('hud-combo-text');
    if (comboEl) {
      comboEl.textContent = `${updated.combo}`;
      const container = document.getElementById('hud-combo-container');
      if (container) {
        container.classList.remove('animate-combo-pop');
        // Use requestAnimationFrame to re-trigger animation without causing synchronous reflow (offsetWidth)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (container) container.classList.add('animate-combo-pop');
          });
        });
      }
    }
    
    const maxComboEl = document.getElementById('hud-max-combo');
    if (maxComboEl) {
      maxComboEl.innerText = `MAX: ${updated.maxCombo}x`;
    }
  };

  const triggerHit = (obj: HitObject, scoreResult: 300 | 100 | 50 | 0) => {
    obj.isHit = scoreResult > 0;
    obj.hitResult = scoreResult;

    const cur = statsRef.current;
    let scoreAdd = scoreResult;
    let comboAdd = scoreResult > 0 ? 1 : 0;
    let comboResetNow = scoreResult === 0;

    // osu! combos add massive scores! Formula approximation: Score = HitValue + HitValue * (Combo * Multiplier / 25)
    let finalScore = cur.score;
    let newCombo = comboResetNow ? 0 : cur.combo + comboAdd;
    let newMaxCombo = Math.max(cur.maxCombo, newCombo);

    if (scoreResult > 0) {
      const comboMultiplier = Math.max(1, cur.combo);
      finalScore += scoreResult + Math.floor(scoreResult * (comboMultiplier * 0.05));
    }

    let hpDiff = 0;
    if (scoreResult === 300) hpDiff = 12;
    else if (scoreResult === 100) hpDiff = 5;
    else if (scoreResult === 50) hpDiff = 2;
    else hpDiff = -10 * (hpDrain * 0.1 + 0.8); // Scale miss harm with difficulty setting

    const newHp = Math.max(0, Math.min(100, cur.hp + hpDiff));

    // Spawn floating score display at the position of the hitcircle
    floatersRef.current.push({
      id: `${obj.id}-result`,
      x: obj.x,
      y: obj.y,
      result: scoreResult,
      timestamp: playheadMsRef.current,
    });

    if (scoreResult > 0) {
      burstsRef.current.push({
        id: `burst-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        x: obj.x,
        y: obj.y,
        color: comboColors[obj.comboSet % comboColors.length],
        timestamp: playheadMsRef.current,
        result: scoreResult,
      });
    }

    // Play satisfactory acoustic click sound!
    if (scoreResult > 0) {
      playHitSound('hit');
    } else {
      playHitSound('miss');
    }

    updateStats({
      score: finalScore,
      combo: newCombo,
      maxCombo: newMaxCombo,
      hp: newHp,
      hits300: cur.hits300 + (scoreResult === 300 ? 1 : 0),
      hits100: cur.hits100 + (scoreResult === 100 ? 1 : 0),
      hits50: cur.hits50 + (scoreResult === 50 ? 1 : 0),
      misses: cur.misses + (scoreResult === 0 ? 1 : 0),
    });
  };

  const getManiaLane = (x: number) => {
    if (x < 128) return 0;
    if (x < 256) return 1;
    if (x < 384) return 2;
    return 3;
  };

  const triggerManiaHit = (lane: number) => {
    if (!isPlayingRef.current || isFailed || isFinished) return;
    const playhead = playheadMsRef.current;
    
    // Sort all objects by approach time first, because multiple could be visible.
    const activeObjects = hitObjectsStateRef.current.filter(obj => {
      const objLane = getManiaLane(obj.x);
      // Extra lenient window for mania
      const isVisible = playhead >= obj.time - hit50Window * 2.5 && playhead <= obj.time + hit50Window;
      return isVisible && !obj.isHit && obj.hitResult === null && objLane === lane;
    }).sort((a, b) => a.time - b.time);

    if (activeObjects.length === 0) return;

    const oldest = activeObjects[0];
    const diff = Math.abs(playhead - oldest.time);

    if (diff <= hit300Window) {
      triggerHit(oldest, 300);
    } else if (diff <= hit100Window) {
      triggerHit(oldest, 100);
    } else if (diff <= hit50Window) {
      triggerHit(oldest, 50);
    } else {
      triggerHit(oldest, 0); // miss
    }
  };

  // Handle actual touchscreen and mouse coordinates
  const triggerClick = (clickX: number, clickY: number) => {
    if (!isPlayingRef.current || isFailed || isFinished) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { scale, offsetX, offsetY } = getTransforms(canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    const playhead = playheadMsRef.current;

    // Convert screen pixel tap into osu! playfield coordinates
    const clickedOsuX = (clickX - offsetX) / scale;
    const clickedOsuY = (clickY - offsetY) / scale;

    // Find the oldest clickable hit object visible right now!
    const activeObjects = hitObjectsStateRef.current.filter(obj => {
      // Must be currently active (within approach preempt time, not yet hit, not yet missed)
      const isVisible = playhead >= obj.time - approachDuration && playhead <= obj.time + hit50Window;
      return isVisible && !obj.isHit && obj.hitResult === null;
    });

    if (activeObjects.length === 0) return;

    // Get the oldest visible object
    const oldest = activeObjects[0];

    // Determine the distance between clicked coords and hit circle center
    const objectScale = settings.autoScaleField !== false ? (settings.uiScale || 1.0) : 1.0;
    const hitRadius = (baseCSSize / 2 * (settings.touchControls ? 1.5 : 1.05)) * objectScale; // precise desktop or generous mobile hitbox
    const dx = clickedOsuX - oldest.x;
    const dy = clickedOsuY - oldest.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (oldest.type === 'spinner') return;

    if (distance <= hitRadius) {
      // It's a Hit! Let's check accuracy timing
      const diff = Math.abs(playhead - oldest.time);

      if (diff <= hit300Window) {
        triggerHit(oldest, 300);
      } else if (diff <= hit100Window) {
        triggerHit(oldest, 100);
      } else if (diff <= hit50Window) {
        triggerHit(oldest, 50);
      } else {
        triggerHit(oldest, 0); // miss
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (settings.useFullSkin) {
      // Calculate active uiScale for bounding box check
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const { scale, offsetX } = getTransforms(w, h);
      
      let uiScale = scale * 0.5;
      const customImgs = loadedCustomSkinImagesRef.current;
      const bgImg = customImgs['scorebar-bgUrl'];
      const autoScaleUi = settings.autoScaleUi !== false;
      
      if (autoScaleUi && bgImg && bgImg.dataset.loaded === 'true' && bgImg.width > 0) {
        const targetWidth = offsetX + 512 * scale;
        uiScale = targetWidth / bgImg.width;
      }
      uiScale *= (settings.customUiScale ?? 1.0);
    }

    mousePosRef.current = { x: clickX, y: clickY };

    // Register visual trailing particle
    trailsRef.current.push({
      id: Math.random().toString(),
      x: clickX,
      y: clickY,
      timestamp: Date.now(),
    });

    if (e.button === 0) {
      activeDesktopKeysRef.current.m1 = true;
    } else {
      activeDesktopKeysRef.current.m2 = true;
    }

    if (!settings.disableClicking) {
      triggerClick(clickX, clickY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      activeDesktopKeysRef.current.m1 = false;
    } else {
      activeDesktopKeysRef.current.m2 = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    mousePosRef.current = { x: clickX, y: clickY };

    // Handle tactile slider dragging / tracking
    const playhead = playheadMsRef.current;
    const { scale, offsetX, offsetY } = getTransforms(canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    const curOsuX = (clickX - offsetX) / scale;
    const curOsuY = (clickY - offsetY) / scale;

    // Render trails
    if (Math.random() < 0.4) {
      trailsRef.current.push({
        id: Math.random().toString(),
        x: clickX,
        y: clickY,
        timestamp: Date.now(),
      });
    }

    // Check sliders currently being held down
    const isPressing = settings.touchControls || activeDesktopKeysRef.current.k1 || activeDesktopKeysRef.current.k2 || activeDesktopKeysRef.current.m1 || activeDesktopKeysRef.current.m2 || e.buttons > 0;
    
    hitObjectsStateRef.current.forEach(obj => {
      if (obj.type === 'slider' && playhead >= obj.time && playhead <= (obj.endTime || obj.time)) {
        // Calculate where the slider ball is at current playhead
        const ratio = (playhead - obj.time) / (obj.duration || 1);
        const ballPos = getSliderPositionAtRatio(obj, ratio);
        
        if (ballPos) {
          const dx = curOsuX - ballPos.x;
          const dy = curOsuY - ballPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          const objectScale = settings.autoScaleField !== false ? (settings.uiScale || 1.0) : 1.0;
          const trackingRadius = baseCSSize * (settings.touchControls ? 1.5 : 1.1) * objectScale;
          if (dist < trackingRadius) {
            // Player is tracking the slider correctly!
            // Grant mini score boost or play tick acoustic feedback
            if (Math.random() < 0.08) {
              const tickId = Math.floor(playhead / 150);
              if (!obj.activeTicksClicked) obj.activeTicksClicked = [];
              if (!obj.activeTicksClicked.includes(tickId)) {
                obj.activeTicksClicked.push(tickId);
                playHitSound('slidertick');
                updateStats({ score: statsRef.current.score + 10 });
              }
            }
          }
        }
      } else if (obj.type === 'spinner' && playhead >= obj.time && playhead <= (obj.endTime || obj.time) && !obj.isHit) {
        if (isPressing) {
          const dx = clickX - rect.width / 2;
          const dy = clickY - rect.height / 2;
          const angle = Math.atan2(dy, dx);
          
          if (lastSpinnerAngleRef.current !== null) {
            let diff = angle - lastSpinnerAngleRef.current;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            
            spinnerSpinsRef.current += Math.abs(diff) / (Math.PI * 2);
            // typical required spins is roughly 3 spins per second.
            const reqSpins = Math.max(1, ((obj.endTime || obj.time) - obj.time) / 1000 * 3);
            
            const progress = Math.min(1, spinnerSpinsRef.current / reqSpins);
            setSpinnerProgress(progress);
            
            if (progress >= 1) {
              triggerHit(obj, 300);
              setSpinnerProgress(null);
            }
          }
          lastSpinnerAngleRef.current = angle;
        } else {
          lastSpinnerAngleRef.current = null;
        }
      }
    });
  };

  const getSliderPositionAtRatio = (obj: HitObject, ratio: number) => {
    if (!obj.sliderPoints || obj.sliderPoints.length < 2) return null;
    
    // Total slides (passes) of the slider
    const slides = obj.slides || 1;
    
    // Clamp overall ratio [0, 1]
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    
    // Scale ratio to current slide index and progress inside that slide
    const currentSlideProgress = clampedRatio * slides;
    const slideIndex = Math.min(slides - 1, Math.floor(currentSlideProgress));
    const slideProgress = currentSlideProgress - slideIndex;
    
    // Odd slide index means we are traveling backward (reverse arrow)
    const isReverse = (slideIndex % 2) === 1;
    let pathRatio = isReverse ? (1 - slideProgress) : slideProgress;
    
    // Clamp to [0, 1] for safety
    pathRatio = Math.max(0, Math.min(1, pathRatio));

    // Ensure cumulative path distance is cached
    if (!(obj as any)._pathLengths) {
      const points = obj.sliderPoints;
      const lengths: number[] = [];
      const cumulative: number[] = [0];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i+1].x - points[i].x;
        const dy = points[i+1].y - points[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        lengths.push(len);
        total += len;
        cumulative.push(total);
      }
      (obj as any)._pathLengths = lengths;
      (obj as any)._cumulativeLengths = cumulative;
      (obj as any)._totalLength = total;
    }
    
    const points = obj.sliderPoints;
    const cumulative = (obj as any)._cumulativeLengths;
    const totalLength = (obj as any)._totalLength;
    
    if (totalLength === 0) return points[0];
    
    // Target distance along slider path
    const targetDist = pathRatio * totalLength;
    
    // Find which segment contains this target distance
    let segmentIndex = 0;
    while (segmentIndex < cumulative.length - 2 && cumulative[segmentIndex + 1] < targetDist) {
      segmentIndex++;
    }
    
    const dStart = cumulative[segmentIndex];
    const dEnd = cumulative[segmentIndex + 1];
    const segmentLength = dEnd - dStart;
    
    let segmentRatio = 0;
    if (segmentLength > 0) {
      segmentRatio = (targetDist - dStart) / segmentLength;
    }
    
    const p1 = points[segmentIndex];
    const p2 = points[segmentIndex + 1];
    
    return {
      x: p1.x + (p2.x - p1.x) * segmentRatio,
      y: p1.y + (p2.y - p1.y) * segmentRatio
    };
  };

  const getSliderPointsBetweenRatios = (obj: HitObject, startRatio: number, endRatio: number) => {
    if (!obj.sliderPoints || obj.sliderPoints.length < 2) return [];
    const steps = 30;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = startRatio + (endRatio - startRatio) * (i / steps);
      const pos = getSliderPositionAtRatio(obj, t);
      if (pos) {
        pts.push(pos);
      }
    }
    return pts;
  };

  const renderGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Reset transform and clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Render dim background layer
    ctx.fillStyle = `rgba(10, 10, 14, ${settings.dimLevel / 100})`;
    ctx.fillRect(0, 0, w, h);

    // Get transforms
    const { scale, offsetX, offsetY } = getTransforms(w, h);
    const playhead = playheadMsRef.current;
    const renderScale = settings.autoScaleField !== false ? (settings.uiScale || 1.0) : 1.0;
    const rawSkin = settings.skinPreset || 'yada!';
    const skin: string = (rawSkin === 'lazer2018' || rawSkin === 'yada!' || rawSkin === 'yara!') ? 'yada!' : 'custom';

    // Render Skin UI (if useFullSkin is active) at the very bottom layer
    if (settings.useFullSkin) {
      const s = statsRef.current;
      const customImgs = loadedCustomSkinImagesRef.current;
      
      let uiScale = scale * 0.5; // Scale down because most elements are @2x
      const bgImg = customImgs['scorebar-bgUrl'];
      const autoScaleUi = settings.autoScaleUi !== false; // defaults to true
      
      if (autoScaleUi && bgImg && bgImg.dataset.loaded === 'true' && bgImg.width > 0) {
        // Touch the right edge of the playfield (offsetX + 512 * scale)
        const targetWidth = offsetX + 512 * scale;
        uiScale = targetWidth / bgImg.width;
      }
      
      // Apply the user's custom scale multiplier from settings
      const customUiScaleMultiplier = settings.customUiScale ?? 1.0;
      uiScale *= customUiScaleMultiplier;

      // HP Bar
      if (bgImg && bgImg.dataset.loaded === 'true') {
        ctx.drawImage(bgImg, 0, 0, bgImg.width * uiScale, bgImg.height * uiScale);
        
        if (customImgs['scorebar-colourUrl']?.dataset.loaded === 'true') {
          const colImg = customImgs['scorebar-colourUrl'];
          // Render HP based on width
          const hpWidth = colImg.width * (s.hp / 100);
          ctx.drawImage(
            colImg, 
            0, 0, hpWidth, colImg.height, 
            3 * uiScale, 3 * uiScale, hpWidth * uiScale, colImg.height * uiScale
          );
        }
        
        if (customImgs['scorebar-markerUrl']?.dataset.loaded === 'true') {
          const markerImg = customImgs['scorebar-markerUrl'];
          const markerX = (customImgs['scorebar-colourUrl']?.width || 0) * (s.hp / 100) * uiScale;
          ctx.drawImage(markerImg, markerX - (markerImg.width * uiScale) / 2, 0, markerImg.width * uiScale, markerImg.height * uiScale);
        }
      }

      // Helper to draw numbers from custom skin
      const drawCustomNumber = (numStr: string, x: number, y: number, prefix: string, anchorRight = false, numScale = 1) => {
        let currentX = x;
        let totalWidth = 0;
        
        // Calculate total width if anchor right
        if (anchorRight) {
          for (let i = 0; i < numStr.length; i++) {
            const char = numStr[i];
            let key = '';
            if (char === '.') key = `${prefix}dotUrl`;
            else if (char === '%') key = `${prefix}percentUrl`;
            else if (char === ',') key = `${prefix}commaUrl`;
            else if (char === 'x') key = `${prefix}xUrl`;
            else key = `${prefix}${char}Url`;
            
            const img = customImgs[key];
            if (img?.dataset.loaded === 'true') {
              totalWidth += img.width * numScale;
            } else {
              totalWidth += 20 * numScale; // fallback
            }
          }
          currentX = x - totalWidth;
        }

        for (let i = 0; i < numStr.length; i++) {
          const char = numStr[i];
          let key = '';
          if (char === '.') key = `${prefix}dotUrl`;
          else if (char === '%') key = `${prefix}percentUrl`;
          else if (char === ',') key = `${prefix}commaUrl`;
          else if (char === 'x') key = `${prefix}xUrl`;
          else key = `${prefix}${char}Url`;
          
          const img = customImgs[key];
          if (img?.dataset.loaded === 'true') {
            ctx.drawImage(img, currentX, y, img.width * numScale, img.height * numScale);
            currentX += img.width * numScale;
          } else {
            ctx.fillStyle = 'white';
            ctx.font = `bold ${30 * numScale}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(char, currentX + 10 * numScale, y + 25 * numScale);
            currentX += 20 * numScale;
          }
        }
      };

      // Score
      const scoreStr = s.score.toString().padStart(7, '0');
      drawCustomNumber(scoreStr, w - 10 * uiScale, 10 * uiScale, 'score-', true, uiScale * 0.9);

      // Accuracy
      const acc = getAccuracyRef();
      const accStr = acc.toFixed(2) + '%';
      drawCustomNumber(accStr, w - 15 * uiScale, 45 * uiScale, 'score-', true, uiScale * 0.5);

      // Combo
      const comboStr = s.combo + 'x';
      drawCustomNumber(comboStr, 10 * uiScale, h - 100 * uiScale, 'combo-', false, uiScale * 1);
    }

    // === MANIA MODE RENDERING ===
    if (settings.gameMode === 'mania') {
      const mobileBoost = settings.maniaMobileMode ? 2.0 : 1.0;
      const laneWidth = 60 * scale * renderScale * mobileBoost;
      const trackWidth = laneWidth * 4;
      const startX = offsetX + (512 * scale) / 2 - trackWidth / 2;
      let startY = offsetY;
      let height = 384 * scale;

      if (settings.maniaMobileMode) {
        startY = 20 * scale;
        height = h - (h / 3) - startY;
      }

      // Draw track bg
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(startX, startY, trackWidth, height);

      // Draw lanes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(startX + i * laneWidth, startY);
        ctx.lineTo(startX + i * laneWidth, startY + height);
        ctx.stroke();
      }

      // Draw Judgment Line / Hit Window Area
      const hitTargetY = startY + height - 20 * scale;
      
      // Draw Hit Window Background
      const hitWindowPx = (hit300Window / approachDuration) * (height - 20 * scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(startX, hitTargetY - hitWindowPx, trackWidth, hitWindowPx * 2);
      
      // Draw actual exact perfect hit line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(startX, hitTargetY);
      ctx.lineTo(startX + trackWidth, hitTargetY);
      ctx.stroke();

      // Draw keys and press feedback
      const keys = ['D', 'F', 'J', 'K'];
      for (let i = 0; i < 4; i++) {
        const isPressed = activeManiaKeysRef.current[i];
        
        let laneColor = '#00E8FF';
        let keyImage = '';
        let keyImageD = '';
        if (skin === 'custom') {
          if (settings.customSkinColors?.mania?.[4]) {
            const maniaConf = settings.customSkinColors.mania[4];
            if (maniaConf.colors?.[`colourlight${i + 1}`]) laneColor = maniaConf.colors[`colourlight${i + 1}`];
            keyImage = maniaConf.images?.[`keyimage${i}`] || '';
            keyImageD = maniaConf.images?.[`keyimage${i}d`] || '';
          }
          if (!keyImage) keyImage = (i === 0 || i === 3) ? 'mania-key1' : 'mania-key2';
          if (!keyImageD) keyImageD = (i === 0 || i === 3) ? 'mania-key1d' : 'mania-key2d';
        }

        if (isPressed) {
          const grd = ctx.createLinearGradient(0, startY + height, 0, startY + height - 150 * scale);
          const colorValues = laneColor.startsWith('#') ? laneColor : '#00E8FF';
          // Convert hex to rgb for rgba usage if it's hex
          let r = 0, g = 232, b = 255;
          if (colorValues.length === 7) {
            r = parseInt(colorValues.slice(1, 3), 16);
            g = parseInt(colorValues.slice(3, 5), 16);
            b = parseInt(colorValues.slice(5, 7), 16);
          }
          grd.addColorStop(0, `rgba(${r},${g},${b}, 0.5)`);
          grd.addColorStop(1, `rgba(${r},${g},${b}, 0)`);
          ctx.fillStyle = grd;
          ctx.fillRect(startX + i * laneWidth, startY, laneWidth, height);
        }
        
        const imgKeyToUse = (isPressed && keyImageD) ? keyImageD : keyImage;
        const skinImg = imgKeyToUse ? loadedCustomSkinImagesRef.current[`${imgKeyToUse.toLowerCase()}Url`] : null;

        if (skinImg && skinImg.dataset.loaded === 'true') {
          const imgH = laneWidth * (skinImg.naturalHeight / skinImg.naturalWidth);
          ctx.drawImage(skinImg, startX + i * laneWidth, startY + height - imgH, laneWidth, imgH);
        } else {
          const keyHeight = isPressed ? 8 * scale : 16 * scale;
          const keyOffset = (16 * scale - keyHeight) / 2;
          ctx.fillStyle = isPressed ? (settings.randomKidMode ? '#A9D3B2' : laneColor) : '#FFFFFF';
          ctx.fillRect(startX + i * laneWidth, hitTargetY - 8 * scale + keyOffset, laneWidth, keyHeight);
          
          // Add a highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(startX + i * laneWidth, hitTargetY - 8 * scale + keyOffset, laneWidth, 2 * scale);
        }

        ctx.font = `bold ${14 * scale}px var(--font-sans)`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(keys[i], startX + i * laneWidth + laneWidth / 2, startY + height + 20 * scale);
      }

      // Draw notes
      const fallDuration = approachDuration;
      hitObjectsStateRef.current.forEach((obj) => {
        // Skip misses, and skip fully completed hits
        if (obj.hitResult === 0) return;
        // if it's a normal note and it's hit, skip
        if (obj.hitResult !== null && !obj.endTime) return;
        // if it's a hold note and playhead passed its end, skip
        if (obj.hitResult !== null && obj.endTime && playhead > obj.endTime) return;
        
        const isVisible = playhead >= obj.time - fallDuration && playhead <= (obj.endTime ? obj.endTime + hit50Window : obj.time + hit50Window);
        if (!isVisible) return;

        const lane = getManiaLane(obj.x);
        const fallRatio = Math.max(0, 1 - (obj.time - playhead) / fallDuration);
        const noteY = startY + (height - 20 * scale) * fallRatio;
        const noteHeight = 15 * scale;

        let noteColor = (lane === 0 || lane === 3) ? '#00E8FF' : '#33EFFF';
        let noteImage = '';
        let holdImage = '';
        if (skin === 'custom') {
          if (settings.customSkinColors?.mania?.[4]) {
            const maniaConf = settings.customSkinColors.mania[4];
            if (maniaConf.colors?.[`colourlight${lane + 1}`]) {
              noteColor = maniaConf.colors[`colourlight${lane + 1}`];
            }
            noteImage = maniaConf.images?.[`noteimage${lane}`] || '';
            holdImage = maniaConf.images?.[`noteimage${lane}l`] || '';
          }
          if (!noteImage) noteImage = (lane === 0 || lane === 3) ? 'mania-note1' : 'mania-note2';
          if (!holdImage) holdImage = (lane === 0 || lane === 3) ? 'mania-note1L' : 'mania-note2L';
        }
        
        const finalColor = settings.randomKidMode ? ((lane === 0 || lane === 3) ? '#A9D3B2' : '#7FB89D') : noteColor;

        if (obj.endTime) {
          const tailRatio = Math.max(0, 1 - (obj.endTime - playhead) / fallDuration);
          const tailY = startY + (height - 20 * scale) * tailRatio;
          
          const holdSkinImg = holdImage ? loadedCustomSkinImagesRef.current[`${holdImage.toLowerCase()}Url`] : null;
          
          if (holdSkinImg && holdSkinImg.dataset.loaded === 'true') {
             ctx.drawImage(holdSkinImg, startX + lane * laneWidth, tailY, laneWidth, noteY - tailY);
          } else {
            ctx.fillStyle = finalColor;
            ctx.globalAlpha = 0.4;
            // body of the hold note
            ctx.fillRect(startX + lane * laneWidth + 4, tailY, laneWidth - 8, noteY - tailY);
            ctx.globalAlpha = 1.0;
            
            // top edge of hold note
            ctx.fillStyle = finalColor;
            ctx.fillRect(startX + lane * laneWidth + 2, tailY - noteHeight, laneWidth - 4, noteHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeRect(startX + lane * laneWidth + 2, tailY - noteHeight, laneWidth - 4, noteHeight);
          }
        }

        const noteSkinImg = noteImage ? loadedCustomSkinImagesRef.current[`${noteImage.toLowerCase()}Url`] : null;

        if (noteSkinImg && noteSkinImg.dataset.loaded === 'true') {
          const imgH = laneWidth * (noteSkinImg.naturalHeight / noteSkinImg.naturalWidth);
          ctx.drawImage(noteSkinImg, startX + lane * laneWidth, noteY - imgH, laneWidth, imgH);
        } else {
          ctx.fillStyle = finalColor;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.fillRect(startX + lane * laneWidth + 2, noteY - noteHeight, laneWidth - 4, noteHeight);
          ctx.shadowBlur = 0;
          
          // Highlights for 3D look
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillRect(startX + lane * laneWidth + 2, noteY - noteHeight, laneWidth - 4, 3 * scale);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fillRect(startX + lane * laneWidth + 2, noteY - 3 * scale, laneWidth - 4, 3 * scale);
          
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(startX + lane * laneWidth + 2, noteY - noteHeight, laneWidth - 4, noteHeight);
        }
      });
      
      const activeBursts = burstsRef.current.filter((b) => playhead - b.timestamp <= 300);
      burstsRef.current = activeBursts; // Filter bursts to avoid memory leak

      // Override floating animations to be rendered within track bounds
      const activeFloaters = floatersRef.current.filter(f => playhead - f.timestamp <= 600);
      floatersRef.current = activeFloaters;

      activeFloaters.forEach((f) => {
        const age = playhead - f.timestamp;
        const opacity = Math.max(0, 1 - age / 600);
        const dy = (age / 600) * 40 * scale; 
        const lane = getManiaLane(f.x);
        const fx = startX + lane * laneWidth + laneWidth / 2;
        const fy = startY + height - Math.min(100, dy); // float upwards near bottom

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (f.result === 300) {
          ctx.fillStyle = `rgba(34, 197, 94, ${opacity})`;
          ctx.font = `bold ${Math.floor(28 * scale)}px var(--font-sans)`;
          ctx.fillText('300', fx, fy);
        } else if (f.result === 100) {
          ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;
          ctx.font = `bold ${Math.floor(24 * scale)}px var(--font-sans)`;
          ctx.fillText('100', fx, fy);
        } else if (f.result === 50) {
          ctx.fillStyle = `rgba(234, 179, 8, ${opacity})`;
          ctx.font = `bold ${Math.floor(20 * scale)}px var(--font-sans)`;
          ctx.fillText('50', fx, fy);
        } else {
          ctx.fillStyle = `rgba(239, 68, 68, ${opacity})`;
          ctx.font = `bold ${Math.floor(26 * scale)}px var(--font-sans)`;
          ctx.fillText('✕', fx, fy);
        }
        ctx.restore();
      });

      return;
    }
    // === END MANIA MODE RENDERING ===


    // Draw OSU Playfield Area Neon boundary
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, 512 * scale, 384 * scale);

    // Draw active key presses or touchscreen tap targets at margins for neat styling
    if (settings.touchControls) {
      // Draw two neat large glowing virtual tap regions at lower left and lower right
      const tapRadius = 45;
      
      // Left Tap Target
      ctx.beginPath();
      ctx.arc(60 + tapRadius, h - 80, tapRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.font = '12px var(--font-mono)';
      ctx.textAlign = 'center';
      ctx.fillText('TAP K1', 60 + tapRadius, h - 76);

      // Right Tap Target
      ctx.beginPath();
      ctx.arc(w - 60 - tapRadius, h - 80, tapRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(236, 72, 153, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.7)';
      ctx.fillText('TAP K2', w - 60 - tapRadius, h - 76);
    }

    // Step 1: Draw ALL active sliders first (so hit circles are layered on top)
    hitObjectsStateRef.current.forEach((obj) => {
      // Filter visibility
      const isVisible = playhead >= obj.time - approachDuration && playhead <= (obj.endTime || obj.time + 500);
      if (!isVisible) return;

      if (obj.type === 'slider' && obj.sliderPoints && obj.sliderPoints.length >= 2) {
        const color = comboColors[obj.comboSet % comboColors.length];

        // Choose color for track
        let strokeColor = color;
        if (skin === 'custom' && settings.customSkinColors?.sliderTrackColor) {
          strokeColor = settings.customSkinColors.sliderTrackColor;
        }

        // Determine slider points configuration based on skin snaking/retraction settings
        let pointsToDraw = obj.sliderPoints;
        let isFullyExtended = true;
        if (skin !== 'classic') {
          // If in approach stage: snake-in
          if (playhead < obj.time) {
            const ratioProgress = Math.max(0, Math.min(1, (playhead - (obj.time - approachDuration)) / approachDuration));
            pointsToDraw = getSliderPointsBetweenRatios(obj, 0, ratioProgress);
            if (ratioProgress < 1.0) isFullyExtended = false;
          } else {
            // Sliding stage: retract behind ball (snake-out!)
            const ratioProgress = Math.max(0, Math.min(1, (playhead - obj.time) / (obj.duration || 1)));
            pointsToDraw = getSliderPointsBetweenRatios(obj, ratioProgress, 1.0);
          }
        }

        // Draw slider track body
        if (pointsToDraw && pointsToDraw.length >= 2) {
          ctx.beginPath();
          const startPt = pointsToDraw[0];
          ctx.moveTo(offsetX + startPt.x * scale, offsetY + startPt.y * scale);
          
          for (let i = 1; i < pointsToDraw.length; i++) {
            const pt = pointsToDraw[i];
            ctx.lineTo(offsetX + pt.x * scale, offsetY + pt.y * scale);
          }

          // Draw double layer track (thick dark gray filled inside, color neon glowing outline)
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          if (skin === 'argon') {
            // Argon 2022 Style Track:
            // 1. Sleek semi-transparent dark grey bed
            ctx.strokeStyle = 'rgba(10, 10, 15, 0.85)';
            ctx.lineWidth = baseCSSize * scale * 0.95 * renderScale;
            ctx.stroke();

            // 2. Twin thin border glows that define the rail edge
            let glow = strokeColor;
            if (glow.startsWith('#')) {
              const hex = glow.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16) || 0;
              const g = parseInt(hex.substring(2, 4), 16) || 0;
              const b = parseInt(hex.substring(4, 6), 16) || 0;
              glow = `rgba(${r}, ${g}, ${b}, 0.5)`;
            } else {
              glow = strokeColor.replace('rgb', 'rgba').replace(')', ', 0.5)');
            }
            
            ctx.strokeStyle = glow;
            ctx.lineWidth = baseCSSize * scale * 1.15 * renderScale;
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = baseCSSize * scale * 1.05 * renderScale;
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(10, 10, 15, 0.95)';
            ctx.lineWidth = baseCSSize * scale * 0.92 * renderScale;
            ctx.stroke();

            // 3. Middle fine neon colored flow-line in track center
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = baseCSSize * scale * 0.12 * renderScale;
            ctx.stroke();

          } else if (skin === 'whitecat') {
            // White Cat clean style:
            // 1. Super transparent soft light gray fill
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
            ctx.lineWidth = baseCSSize * scale * 0.96 * renderScale;
            ctx.stroke();

            // 2. Clean outer white border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = baseCSSize * scale * 1.12 * renderScale;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.lineWidth = baseCSSize * scale * 0.95 * renderScale;
            ctx.stroke();

            // 3. Thin light cyan center line
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
            ctx.lineWidth = baseCSSize * scale * 0.08 * renderScale;
            ctx.stroke();

          } else {
            // Lazer, Classic, Custom standard glow track
            if (skin === 'custom') {
               const border = settings.customSkinColors?.sliderBorderColor || '#ffffff';
               const track = settings.customSkinColors?.sliderTrackColor || 'rgba(20, 20, 25, 0.9)';
               ctx.strokeStyle = border;
               ctx.lineWidth = baseCSSize * scale * 1.25 * renderScale;
               ctx.stroke();

               ctx.strokeStyle = track;
               ctx.lineWidth = baseCSSize * scale * 0.95 * renderScale;
               ctx.stroke();
            } else {
              let trackGlow = strokeColor;
              if (trackGlow.startsWith('#')) {
                const hex = trackGlow.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16) || 0;
                const g = parseInt(hex.substring(2, 4), 16) || 0;
                const b = parseInt(hex.substring(4, 6), 16) || 0;
                trackGlow = `rgba(${r}, ${g}, ${b}, 0.35)`;
              } else {
                trackGlow = strokeColor.replace('rgb', 'rgba').replace(')', ', 0.35)');
              }

              ctx.strokeStyle = trackGlow;
              ctx.lineWidth = baseCSSize * scale * 1.3 * renderScale;
              ctx.stroke();

              ctx.strokeStyle = 'rgba(25, 25, 30, 0.9)';
              ctx.lineWidth = baseCSSize * scale * 0.95 * renderScale;
              ctx.stroke();
            }
          }
        }

        // Draw Slider Tail hitcircle graphic for custom and yada! skins
        if ((skin === 'custom' || skin === 'yada!') && obj.sliderPoints && obj.sliderPoints.length > 0 && isFullyExtended) {
           const tailPt = obj.sliderPoints[obj.sliderPoints.length - 1];
           const tx = offsetX + tailPt.x * scale;
           const ty = offsetY + tailPt.y * scale;
           const customImages = loadedCustomSkinImagesRef.current;
           const hcImg = customImages['sliderendcircleUrl'] || customImages['hitcircleUrl'];
           const hcoImg = customImages['sliderendcircleoverlayUrl'] || customImages['hitcircleoverlayUrl'];
           const radius = (baseCSSize / 2) * scale * renderScale;
           const diameter = baseCSSize * scale * renderScale;
           
           if ((hcImg && hcImg.dataset.loaded === 'true') || (hcoImg && hcoImg.dataset.loaded === 'true')) {
             ctx.save();
             ctx.beginPath();
             ctx.arc(tx, ty, radius, 0, Math.PI * 2);
             ctx.clip();
             if (hcImg && hcImg.dataset.loaded === 'true') {
               const tinted = getTintedCanvas(hcImg, color);
               if (tinted) {
                 ctx.drawImage(tinted, tx - radius, ty - radius, diameter, diameter);
               } else {
                 ctx.drawImage(hcImg, tx - radius, ty - radius, diameter, diameter);
               }
             }
             if (hcoImg && hcoImg.dataset.loaded === 'true') {
               ctx.drawImage(hcoImg, tx - radius, ty - radius, diameter, diameter);
             }
             ctx.restore();
           } else {
              ctx.beginPath(); ctx.arc(tx, ty, radius, 0, Math.PI * 2);
              ctx.fillStyle = color; ctx.fill();
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * scale * renderScale; ctx.stroke();
           }
        }

        // Draw Reverse Arrows
        if ((obj.slides || 1) > 1 && obj.sliderPoints && obj.sliderPoints.length >= 2) {
          const singleDuration = (obj.duration || 1) / (obj.slides || 1);
          for (let i = 1; i < (obj.slides || 1); i++) {
            // Only draw if playhead hasn't passed this reverse point
            if (playhead < obj.time + singleDuration * i) {
              const isAtEnd = i % 2 !== 0;
              const rp = isAtEnd ? obj.sliderPoints[obj.sliderPoints.length - 1] : obj.sliderPoints[0];
              const prev = isAtEnd ? obj.sliderPoints[obj.sliderPoints.length - 2] : obj.sliderPoints[1];
              
              if (rp && prev) {
                const angle = Math.atan2(prev.y - rp.y, prev.x - rp.x);
                
                ctx.save();
                ctx.translate(offsetX + rp.x * scale, offsetY + rp.y * scale);
                ctx.rotate(angle);
                
                const revImg = loadedCustomSkinImagesRef.current['reversearrowUrl'];
                if ((skin === 'custom' || skin === 'yada!') && revImg && revImg.dataset.loaded === 'true') {
                  const pulse = 1 + 0.1 * Math.sin(Date.now() / 150);
                  ctx.scale(pulse, pulse);
                  const revSize = baseCSSize * scale * 2 * renderScale;
                  ctx.drawImage(revImg, -revSize / 2, -revSize / 2, revSize, revSize);
                } else {
                  // Draw a nice arrow! Pulse the arrow slightly
                  const pulse = 1 + 0.1 * Math.sin(Date.now() / 150);
                  ctx.scale(pulse, pulse);
                  
                  ctx.beginPath();
                  ctx.moveTo(10 * scale * renderScale, 0);
                  ctx.lineTo(25 * scale * renderScale, 15 * scale * renderScale);
                  ctx.moveTo(10 * scale * renderScale, 0);
                  ctx.lineTo(25 * scale * renderScale, -15 * scale * renderScale);
                  
                  ctx.moveTo(-10 * scale * renderScale, 0);
                  ctx.lineTo(5 * scale * renderScale, 15 * scale * renderScale);
                  ctx.moveTo(-10 * scale * renderScale, 0);
                  ctx.lineTo(5 * scale * renderScale, -15 * scale * renderScale);
                  
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                  ctx.lineWidth = 6 * scale * renderScale;
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';
                  ctx.stroke();
                }
                
                ctx.restore();
              }
            }
          }
        }

        // Draw moving slider ball tracking indicator if sliding is currently active
        if (playhead >= obj.time && playhead <= (obj.endTime || obj.time)) {
          const ratio = (playhead - obj.time) / (obj.duration || 1);
          const pos = getSliderPositionAtRatio(obj, ratio);
          
          if (pos) {
            if (skin === 'argon') {
              // Glowing outer shield
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.85) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 4 * renderScale;
              ctx.fill();
              ctx.stroke();

              // Concentric inner line
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.5) * scale * renderScale, 0, Math.PI * 2);
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.8 * renderScale;
              ctx.stroke();

              // Tiny sharp center core
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.25) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = strokeColor;
              ctx.fill();

            } else if ((skin === 'custom' || skin === 'yada!') && loadedCustomSkinImagesRef.current['sliderbUrl'] && loadedCustomSkinImagesRef.current['sliderbUrl'].dataset.loaded === 'true') {
              const sbImg = loadedCustomSkinImagesRef.current['sliderbUrl'];
              const sbSize = (baseCSSize * 2) * scale * renderScale;
              ctx.drawImage(sbImg, offsetX + pos.x * scale - sbSize / 2, offsetY + pos.y * scale - sbSize / 2, sbSize, sbSize);
              
              const sfcImg = loadedCustomSkinImagesRef.current['sliderfollowcircleUrl'];
              if (sfcImg && sfcImg.dataset.loaded === 'true') {
                 const sfcSize = sbSize * 1.5;
                 ctx.drawImage(sfcImg, offsetX + pos.x * scale - sfcSize / 2, offsetY + pos.y * scale - sfcSize / 2, sfcSize, sfcSize);
              }
            } else if (skin === 'yada!') {
              // osu! Lazer 2018 styled Slider Ball:
              // Beautiful bright glowing white inner core + colored surrounding tracking circle!
              // 1. Surrounding colored tracking circle
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 1.1) * scale * renderScale, 0, Math.PI * 2);
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 2 * renderScale;
              ctx.stroke();

              // 2. Thick glowing semi-transparent body
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.75) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3 * renderScale;
              ctx.fill();
              ctx.stroke();

              // 3. Compact glowing inner white core
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.4) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();

            } else if (skin === 'whitecat') {
              // White Cat slider ball: super simple with white ring + neon cyan center dot
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.65) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.strokeStyle = '#00e5ff';
              ctx.lineWidth = 2.5 * renderScale;
              ctx.fill();
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.25) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = '#00e5ff';
              ctx.fill();

            } else {
              // Glowing outer shield
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.8) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 3 * renderScale;
              ctx.fill();
              ctx.stroke();

              // Core ball
              ctx.beginPath();
              ctx.arc(offsetX + pos.x * scale, offsetY + pos.y * scale, (baseCSSize * 0.45) * scale * renderScale, 0, Math.PI * 2);
              ctx.fillStyle = '#fff';
              ctx.fill();
            }
          }
        }
      }
    });

    // Step 2: Draw hit circles and approach structures
    // Render back-to-front (oldest on top)
    const drawScale = settings.autoScaleField !== false ? (settings.uiScale || 1.0) : 1.0;

    const objectsToDraw = [...hitObjectsStateRef.current]
      .filter((obj) => {
        if (obj.type === 'spinner') {
          return playhead >= obj.time && playhead <= (obj.endTime || obj.time);
        }
        const isVisible = playhead >= obj.time - approachDuration && playhead <= obj.time + hit50Window;
        return isVisible && !obj.isHit && obj.hitResult === null;
      })
      .reverse(); // Reverse so older items draw last (on top)

    objectsToDraw.forEach((obj) => {
      const color = comboColors[obj.comboSet % comboColors.length];
      const diameter = baseCSSize * scale * drawScale;
      const radius = diameter / 2;
      const x = offsetX + obj.x * scale;
      const y = offsetY + obj.y * scale;

      if (obj.type === 'spinner') {
        // Draw the spinner central progress wheel
        const spinRadius = 120 * scale * drawScale;
        
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, spinRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 15 * drawScale;
        ctx.stroke();

        // Draw spinner active progress
        const isCleared = obj.isHit && obj.hitResult !== 0;
        const displayProgress = isCleared ? 1 : (spinnerProgress || 0);
        if (displayProgress > 0) {
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, spinRadius, -Math.PI / 2, -Math.PI / 2 + displayProgress * Math.PI * 2);
          
          let spinnerColor = 'rgb(236, 72, 153)';
          if (skin === 'custom' && settings.customSkinColors?.spinnerColor) {
            spinnerColor = settings.customSkinColors.spinnerColor;
          }
          
          ctx.strokeStyle = spinnerColor;
          ctx.lineWidth = 16 * drawScale;
          ctx.stroke();
        }

        // Draw prompt text
        ctx.font = `bold ${Math.floor(20 * drawScale)}px var(--font-sans)`;
        ctx.fillStyle = isCleared ? '#A9D3B2' : (obj.hitResult === 0 ? '#ff4444' : '#fff');
        ctx.textAlign = 'center';
        ctx.fillText(isCleared ? 'CLEAR!' : (obj.hitResult === 0 ? 'FAILED' : 'SPIN!'), w / 2, h / 2 - 20 * drawScale);

        ctx.font = `${Math.floor(14 * drawScale)}px var(--font-mono)`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const reqSpins = Math.max(1, ((obj.endTime || obj.time) - obj.time) / 1000 * 3);
        ctx.fillText(`${Math.floor(spinnerSpinsRef.current)} / ${Math.ceil(reqSpins)}`, w / 2, h / 2 + 20 * drawScale);
        return;
      }

      // 1. Draw HitCircle Body based on Skin preset
      if (skin === 'argon') {
        // Pure Argon 2022 high precision design
        // A clean, semi-transparent deep space grey backing
        ctx.beginPath();
        ctx.arc(x, y, radius - 1 * scale * drawScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 10, 15, 0.88)';
        ctx.fill();

        // Glowing outer neon border of combo color
        ctx.beginPath();
        ctx.arc(x, y, radius - 1.5 * scale * drawScale, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * scale * drawScale;
        ctx.stroke();

        // Sleek sharp white accent border ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3 * scale * drawScale;
        ctx.stroke();

        // Inner micro details (concentric fine circle)
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1 * scale * drawScale;
        ctx.stroke();

      } else if (skin === 'whitecat') {
        // White Cat theme: minimalist slate blue, clean thin white frame
        ctx.beginPath();
        ctx.arc(x, y, radius - 1.5 * scale * drawScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20, 26, 38, 0.94)';
        ctx.fill();

        // Clean white outline border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 * scale * drawScale;
        ctx.stroke();

        // High contrast light cyan micro center ring
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
        ctx.fill();

      } else if (skin === 'yada!') {
        const customImages = loadedCustomSkinImagesRef.current;
        let drawnCustom = false;
        
        const hcImg = customImages['hitcircleUrl'];
        const hcoImg = customImages['hitcircleoverlayUrl'];
        
        if ((hcImg && hcImg.dataset.loaded === 'true') || (hcoImg && hcoImg.dataset.loaded === 'true')) {
          drawnCustom = true;
          if (hcImg && hcImg.dataset.loaded === 'true') {
            const tinted = getTintedCanvas(hcImg, color);
            if (tinted) {
              ctx.drawImage(tinted, x - radius, y - radius, diameter, diameter);
            } else {
              ctx.drawImage(hcImg, x - radius, y - radius, diameter, diameter);
            }
          }
          if (hcoImg && hcoImg.dataset.loaded === 'true') {
            ctx.drawImage(hcoImg, x - radius, y - radius, diameter, diameter);
          }
        }
        
        if (!drawnCustom) {
          // osu! Lazer 2018 skin (by DP05) high fidelity drawing:
          // A beautiful, semi-transparent deep dark background with subtle combo tint
          ctx.beginPath();
          ctx.arc(x, y, radius - 1.5 * scale * drawScale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(12, 12, 18, 0.82)';
          ctx.fill();

          // Smooth inner ring filled with a glowing solid combo color tint
          ctx.beginPath();
          ctx.arc(x, y, radius - 3.5 * scale * drawScale, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 4 * scale * drawScale;
          ctx.stroke();

          // Bright crisp pure white outer frame ring
          ctx.beginPath();
          ctx.arc(x, y, radius - 0.5 * scale * drawScale, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8 * scale * drawScale;
          ctx.stroke();

          // Subtle soft white micro center overlay dot
          ctx.beginPath();
          ctx.arc(x, y, radius * 0.15, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fill();
        }

      } else if (skin === 'lazer') {
        // Inner transparent dark backing
        ctx.beginPath();
        ctx.arc(x, y, radius - 2 * scale * drawScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
        ctx.fill();

        // Thick combo colored ring
        ctx.beginPath();
        ctx.arc(x, y, radius - 2.5 * scale * drawScale, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5 * scale * drawScale;
        ctx.stroke();

        // Edge white outlines
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 * scale * drawScale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius - 5 * scale * drawScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1 * scale * drawScale;
        ctx.stroke();

      } else if (skin === 'custom') {
        const customImages = loadedCustomSkinImagesRef.current;
        let drawnCustom = false;
        
        const hcImg = customImages['hitcircleUrl'];
        const hcoImg = customImages['hitcircleoverlayUrl'];
        
        if ((hcImg && hcImg.dataset.loaded === 'true') || (hcoImg && hcoImg.dataset.loaded === 'true')) {
          drawnCustom = true;
          if (hcImg && hcImg.dataset.loaded === 'true') {
            const tinted = getTintedCanvas(hcImg, color);
            if (tinted) {
              ctx.drawImage(tinted, x - radius, y - radius, diameter, diameter);
            } else {
              ctx.drawImage(hcImg, x - radius, y - radius, diameter, diameter);
            }
          }
          if (hcoImg && hcoImg.dataset.loaded === 'true') {
            ctx.drawImage(hcoImg, x - radius, y - radius, diameter, diameter);
          }
        }
        
        if (!drawnCustom) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4 * scale * drawScale;
          ctx.stroke();
        }
      } else {
        // Classic style
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        const grad = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius);
        grad.addColorStop(0, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * scale * drawScale;
        ctx.stroke();
      }

      // Bold combo index number or customized micro index inside the hit circle
      if (skin === 'whitecat') {
        // White Cat uses very small clean numbers
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(radius * 0.5)}px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.comboIndex.toString(), x, y);
      } else if (skin === 'argon') {
        // Argon numbers are beautifully small, clean, bold space-monospaced
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.floor(radius * 0.65)}px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.comboIndex.toString(), x, y);
      } else if (skin === 'yada!') {
        // Beautiful clean, bold, medium-sized, high-readability numbers
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(radius * 0.68)}px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.comboIndex.toString(), x, y);
      } else {
        // Lazer / Classic / Custom
        let drawnNumberImages = false;
        if (skin === 'custom') {
          const customImages = loadedCustomSkinImagesRef.current;
          const str = obj.comboIndex.toString();
          let hasAll = true;
          for (const char of str) {
            if (!customImages[`default-${char}Url`] || customImages[`default-${char}Url`].dataset.loaded !== 'true') {
              hasAll = false;
              break;
            }
          }
          if (hasAll) {
            drawnNumberImages = true;
            let totalW = 0;
            const imgs = [];
            // Target height scales with circle radius
            const targetH = radius * 1.35;
            for (const char of str) {
              const img = customImages[`default-${char}Url`];
              const ratio = img.naturalWidth / img.naturalHeight;
              const targetW = targetH * ratio;
              totalW += targetW;
              imgs.push({ img, targetW, targetH });
            }
            // Add slight overlapping/kerning typical of osu! numbers
            const kerning = radius * -0.05;
            totalW += kerning * (imgs.length - 1);
            
            let currX = x - totalW / 2;
            for (const data of imgs) {
              ctx.drawImage(data.img, currX, y - data.targetH / 2, data.targetW, data.targetH);
              currX += data.targetW + kerning;
            }
          }
        }
        
        if (!drawnNumberImages) {
          if (skin === 'custom' && settings.customSkinColors?.textColor) {
            ctx.fillStyle = settings.customSkinColors.textColor;
          } else {
            ctx.fillStyle = '#ffffff';
          }
          ctx.font = `bold ${Math.floor(radius * 0.95)}px var(--font-sans)`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.comboIndex.toString(), x, y);
        }
      }

      // 2. Draw outer shrinking Approach Circle (only before hits)
      if (playhead < obj.time) {
        const timeRemaining = obj.time - playhead;
        const approachRatio = timeRemaining / approachDuration; // starts at 1, goes to 0 on target hit time
        
        const approachSizeMultiplier = 1.0 + approachRatio * 2.5; 
        const approachRadius = radius * approachSizeMultiplier;

        const aprImg = loadedCustomSkinImagesRef.current['approachcircleUrl'];
        if ((skin === 'custom' || skin === 'yada!') && aprImg && aprImg.dataset.loaded === 'true') {
          const tintedApr = getTintedCanvas(aprImg, color);
          const aprDiameter = approachRadius * 2;
          if (tintedApr) {
            ctx.drawImage(tintedApr, x - approachRadius, y - approachRadius, aprDiameter, aprDiameter);
          } else {
            ctx.drawImage(aprImg, x - approachRadius, y - approachRadius, aprDiameter, aprDiameter);
          }
        } else {
          ctx.beginPath();
          ctx.arc(x, y, approachRadius, 0, Math.PI * 2);

          let aprColor = color;
          if (skin === 'whitecat') {
            aprColor = 'rgba(0, 229, 255, 0.85)'; // White Cat signature cyan approach circles
          } else if (skin === 'argon' || skin === 'yada!') {
            aprColor = color; // Matches glowing accents
          }
          ctx.strokeStyle = aprColor;
          ctx.lineWidth = (skin === 'lazer' || skin === 'yada!' || skin === 'argon' || skin === 'whitecat' ? 1.5 : 2.5) * scale * drawScale;
          ctx.stroke();
        }
      }
    });

    // Step 3: Draw swipe/trail touch particles (neon dots fading)
    trailsRef.current.forEach((t) => {
      const age = Date.now() - t.timestamp;
      const opacity = Math.max(0, 1 - age / 400);
      
      ctx.beginPath();
      ctx.arc(t.x, t.y, 6 * opacity, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(6, 182, 212, ${opacity * 0.8})`;
      ctx.fill();
    });

    // Step 4: Draw Floating Hit accuracy scores (300, 100, 50, Miss)
    const activeFloatersStandard = floatersRef.current.filter((f) => playhead - f.timestamp <= 600);
    floatersRef.current = activeFloatersStandard;

    activeFloatersStandard.forEach((f) => {
      const age = playhead - f.timestamp;
      const opacity = Math.max(0, 1 - age / 600);
      const dy = (age / 600) * 45 * drawScale; // float slowly upwards
      const fx = offsetX + f.x * scale;
      const fy = offsetY + f.y * scale - dy;

      ctx.save();
      ctx.globalAlpha = opacity;
      
      let imgKey = '';
      if (f.result === 300) imgKey = 'hit300Url';
      else if (f.result === 100) imgKey = 'hit100Url';
      else if (f.result === 50) imgKey = 'hit50Url';
      else imgKey = 'hit0Url';

      const img = loadedCustomSkinImagesRef.current[imgKey];
      if ((skin === 'custom' || skin === 'yada!') && img && img.dataset.loaded === 'true') {
         // Draw custom image centered
         const ratio = img.naturalWidth / img.naturalHeight;
         const th = 15 * drawScale;
         const tw = th * ratio;
         ctx.drawImage(img, fx - tw / 2, fy - th / 2, tw, th);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (f.result === 300) {
          ctx.fillStyle = `rgba(34, 197, 94, 1)`;
          ctx.font = `bold ${Math.floor(28 * drawScale)}px var(--font-sans)`;
          ctx.fillText('300', fx, fy);
        } else if (f.result === 100) {
          ctx.fillStyle = `rgba(59, 130, 246, 1)`;
          ctx.font = `bold ${Math.floor(24 * drawScale)}px var(--font-sans)`;
          ctx.fillText('100', fx, fy);
        } else if (f.result === 50) {
          ctx.fillStyle = `rgba(234, 179, 8, 1)`;
          ctx.font = `bold ${Math.floor(20 * drawScale)}px var(--font-sans)`;
          ctx.fillText('50', fx, fy);
        } else {
          // Miss! Render a nice red cross
          ctx.fillStyle = `rgba(239, 68, 68, 1)`;
          ctx.font = `bold ${Math.floor(26 * drawScale)}px var(--font-sans)`;
          ctx.fillText('✕', fx, fy);
        }
      }
      ctx.restore();
    });

    // Step 5: Draw Hit Burst Effects (Tipp-Effekte / Sparks)
    const activeBursts = burstsRef.current.filter((b) => playheadMsRef.current - b.timestamp <= 300);
    burstsRef.current = activeBursts; // Keep only active ones

    activeBursts.forEach((b) => {
      const age = playheadMsRef.current - b.timestamp;
      const progress = age / 300; // 0 to 1
      const opacity = Math.max(0, 1 - progress);
      const bx = offsetX + b.x * scale;
      const by = offsetY + b.y * scale;

      const baseRadius = (baseCSSize / 2) * scale * drawScale;

      ctx.save();
      
      // 1. Glowing expanding shockwave ring
      ctx.beginPath();
      ctx.arc(bx, by, baseRadius * (1.0 + progress * 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 4 * (1 - progress) * drawScale;
      ctx.globalAlpha = opacity * 0.7;
      ctx.stroke();

      // 2. Translucent outer flare expansion
      ctx.beginPath();
      ctx.arc(bx, by, baseRadius * (1.1 + progress * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.globalAlpha = opacity * 0.2;
      ctx.fill();

      // 3. Draw sparks shoots (radial rays)
      const rayCount = 8;
      const rayLen = 14 * scale * drawScale;
      const rayDist = baseRadius * (1.0 + progress * 1.2);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * (1 - progress) * drawScale;
      ctx.globalAlpha = opacity;

      for (let j = 0; j < rayCount; j++) {
        const angle = (j / rayCount) * Math.PI * 2 + progress * 0.5; // Slight spin!
        const sx = bx + Math.cos(angle) * rayDist;
        const sy = by + Math.sin(angle) * rayDist;
        const ex = bx + Math.cos(angle) * (rayDist + rayLen * (1 - progress * 0.5));
        const ey = by + Math.sin(angle) * (rayDist + rayLen * (1 - progress * 0.5));

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      ctx.restore();
    });

    // Draw Desktop Keyboard / Mouse Key Press Indicators
    if (!settings.touchControls && settings.gameMode !== 'mania') {
      const startX = w - 60;
      const startY = h / 2 - 80;
      const boxW = 40;
      const boxH = 34;
      const spacing = 8;
      
      const keys = [
        { label: 'K1', active: activeDesktopKeysRef.current.k1, desc: 'Z / Y', color: 'rgba(0, 232, 255, ' },
        { label: 'K2', active: activeDesktopKeysRef.current.k2, desc: 'X / C', color: 'rgba(255, 101, 169, ' },
        { label: 'M1', active: activeDesktopKeysRef.current.m1, desc: 'M-L', color: 'rgba(234, 179, 8, ' },
        { label: 'M2', active: activeDesktopKeysRef.current.m2, desc: 'M-R', color: 'rgba(168, 85, 247, ' },
      ];
      
      keys.forEach((k, idx) => {
        const y = startY + idx * (boxH + spacing);
        
        if (k.active) {
          ctx.save();
          ctx.shadowColor = k.color.replace(', ', ', 0.8)');
          ctx.shadowBlur = 15;
          ctx.fillStyle = k.color.replace(', ', ', 0.45)');
          ctx.fillRect(startX, y, boxW, boxH);
          ctx.strokeStyle = k.color.replace(', ', ', 1)');
          ctx.lineWidth = 2;
          ctx.strokeRect(startX, y, boxW, boxH);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(20, 20, 28, 0.45)';
          ctx.fillRect(startX, y, boxW, boxH);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(startX, y, boxW, boxH);
        }
        
        ctx.fillStyle = k.active ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 11px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.fillText(k.label, startX + boxW / 2, y + 16);
        
        ctx.fillStyle = k.active ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
        ctx.font = '8px var(--font-mono)';
        ctx.fillText(k.desc, startX + boxW / 2, y + 28);
      });
    }

    // Draw Custom Desktop Cursor
    if (!settings.touchControls && mousePosRef.current && settings.gameMode !== 'mania') {
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      
      ctx.save();
      
      const isPressing = activeDesktopKeysRef.current.k1 || activeDesktopKeysRef.current.k2 || activeDesktopKeysRef.current.m1 || activeDesktopKeysRef.current.m2;
      
      if ((skin === 'custom' || skin === 'yada!') && loadedCustomSkinImagesRef.current['cursorUrl'] && loadedCustomSkinImagesRef.current['cursorUrl'].dataset.loaded === 'true') {
        const cursorImg = loadedCustomSkinImagesRef.current['cursorUrl'];
        const cSize = (isPressing ? 48 : 44) * (h / 1080); 
        ctx.drawImage(cursorImg, mx - cSize / 2, my - cSize / 2, cSize, cSize);
      } else if (skin === 'yada!') {
        // osu! Lazer 2018 custom cursor replica (glowing magenta/pink outer shield, white crisp center core)
        const outerRadius = isPressing ? 18 : 14;
        
        // 1. Glowing semi-transparent magenta aura
        ctx.beginPath();
        ctx.arc(mx, my, outerRadius * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 101, 169, 0.25)';
        ctx.fill();

        // 2. Crisp solid outer neon border
        ctx.beginPath();
        ctx.arc(mx, my, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff65a9';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 3. Crisp white center dot
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#ff65a9';
        ctx.lineWidth = 1;
        ctx.stroke();

      } else {
        ctx.beginPath();
        const outerRadius = isPressing ? 18 : 14;
        ctx.arc(mx, my, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = isPressing ? 'rgba(0, 232, 255, 0.2)' : 'rgba(255, 101, 169, 0.15)';
        ctx.fill();
        ctx.strokeStyle = isPressing ? 'rgba(0, 232, 255, 0.8)' : 'rgba(255, 101, 169, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const tickLen = 5;
        const tickGap = 5;
        ctx.strokeStyle = isPressing ? 'rgba(0, 232, 255, 0.5)' : 'rgba(255, 101, 169, 0.4)';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath(); ctx.moveTo(mx, my - outerRadius - tickGap); ctx.lineTo(mx, my - outerRadius - tickGap - tickLen); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, my + outerRadius + tickGap); ctx.lineTo(mx, my + outerRadius + tickGap + tickLen); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx - outerRadius - tickGap, my); ctx.lineTo(mx - outerRadius - tickGap - tickLen, my); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx + outerRadius + tickGap, my); ctx.lineTo(mx + outerRadius + tickGap + tickLen, my); ctx.stroke();

        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = isPressing ? '#00E8FF' : '#FF65A9';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      ctx.restore();
    }
  };

  // Compute live play accuracy percentage
  const getAccuracy = () => {
    const s = statsRef.current;
    const totalHits = s.hits300 + s.hits100 + s.hits50 + s.misses;
    if (totalHits === 0) return 100;
    
    const possibleMax = totalHits * 300;
    const actual = s.hits300 * 300 + s.hits100 * 100 + s.hits50 * 50;
    return parseFloat(((actual / possibleMax) * 100).toFixed(2));
  };

  const getAccuracyRef = () => {
    const s = statsRef.current;
    const totalHits = s.hits300 + s.hits100 + s.hits50 + s.misses;
    if (totalHits === 0) return 100;
    const actual = s.hits300 * 300 + s.hits100 * 100 + s.hits50 * 50;
    return parseFloat(((actual / (totalHits * 300)) * 100).toFixed(2));
  };

  // Formatting for osu!lazer leading score aesthetics
  const renderFormattedScore = () => {
    const scoreStr = statsRef.current.score.toString().padStart(8, '0');
    const firstNonZero = scoreStr.search(/[1-9]/);
    let leading = '';
    let active = '';
    if (firstNonZero === -1) {
      leading = scoreStr;
    } else {
      leading = scoreStr.slice(0, firstNonZero);
      active = scoreStr.slice(firstNonZero);
    }
    return (
      <span className="font-mono text-xl md:text-2xl tracking-wider font-extrabold">
        <span id="hud-score-leading" className="text-white/35">{leading}</span>
        <span id="hud-score-active" className="text-white drop-shadow-[0_0_10px_rgba(0,232,255,0.7)]">{active}</span>
      </span>
    );
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0A0A0E] flex flex-col select-none overflow-hidden text-white font-sans">
      
      {/* Dynamic inline-styled animations keyframes matching osu!lazer */}
      <style>{`
        @keyframes comboPop {
          0% { transform: scale(1.23) rotate(-2deg); text-shadow: 0 0 16px rgba(0,232,255,0.85); }
          100% { transform: scale(1) rotate(0deg); text-shadow: 0 0 5px rgba(0,232,255,0.3); }
        }
        .animate-combo-pop {
          animation: comboPop 0.14s cubic-bezier(0.18, 0.89, 0.32, 1.25) forwards;
        }
      `}</style>

      {!settings.useFullSkin && (
        <>
          {/* Laser HP Bar spanning the absolute top width of the screen */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/45 z-30">
            <div 
              id="hud-hp-bar"
              className={`h-full transition-all duration-75 shadow-[0_0_10px_rgba(0,232,255,0.8)] ${
                statsRef.current.hp < 30 
                  ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_14px_rgba(239,68,68,0.95)] animate-pulse' 
                  : 'bg-gradient-to-r from-[#00CFFF] via-[#00E8FF] to-[#33EFFF]'
              }`}
              style={{ width: `${statsRef.current.hp}%` }}
            />
          </div>

          {/* Top Hud Bar */}
          <div className="h-16 border-b border-white/[0.05] bg-[#121216] flex items-center justify-between px-6 z-10 animate-fade-in relative shadow-[0_4px_25px_rgba(0,0,0,0.4)]">
            
            {spectatingReplayName && (
              <div className="absolute left-1/2 -translate-x-1/2 z-20 bg-[#00E8FF]/10 border border-[#00E8FF]/20 text-[#00E8FF] px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(0,232,255,0.2)] backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-[#00E8FF] animate-pulse" />
                <span>SPECTATING REPLAY: {spectatingReplayName}</span>
              </div>
            )}

            {/* Info & Exit Button */}
            <div className="flex items-center gap-4">
              <button 
                id="btn-quit-game"
                onClick={() => {
                  cleanupAudio();
                  handleClose();
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm text-xs text-gray-200 font-extrabold uppercase tracking-wider transition-all cursor-pointer hover:border-[#00E8FF]/30"
              >
                <X className="w-4 h-4 text-[#00E8FF]" />
                <span>Beenden</span>
              </button>
              
              <div className="hidden lg:block border-l border-white/10 pl-4">
                <h1 className="text-xs font-black tracking-widest leading-none text-[#00E8FF] uppercase">SPIELT GERADE</h1>
                <h2 className="text-sm font-bold tracking-tight text-white mt-1 line-clamp-1">{beatmap.title} <span className="opacity-50 text-xs font-medium">[{beatmap.version}]</span></h2>
              </div>
            </div>

            {/* Live Score stats */}
            <div className="flex items-center gap-10">
              
              {/* Accuracy Tickers */}
              <div className="text-right">
                <div className="text-[9px] font-black font-mono text-gray-500 tracking-widest uppercase">ACCURACY</div>
                <div id="hud-accuracy" className="text-lg md:text-xl font-black font-mono text-cyan-400 mt-0.5 tracking-tight">{getAccuracy()}%</div>
              </div>

              {/* Leading Score Display Column */}
              <div className="text-right min-w-[120px]">
                <div className="text-[9px] font-black font-mono text-gray-500 tracking-widest uppercase mb-0.5">SCORE</div>
                <div id="hud-score">
                  {renderFormattedScore()}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Gameplay Canvas Container */}
      <div 
        ref={containerRef}
        className={`flex-1 relative bg-radial from-[#12121b] to-[#08080c] overflow-hidden ${settings.touchControls ? 'cursor-crosshair' : 'cursor-none'}`}
      >
        
        {/* Giant bottom-left combo counter overlay matching osu!lazer */}
        {!settings.useFullSkin && (
          <div className="absolute bottom-6 left-8 pointer-events-none z-25 select-none font-sans">
            <div className="flex flex-col items-start bg-black/25 backdrop-blur-sm p-4 rounded-sm border border-white/5">
              <span className="text-[9px] font-black font-mono tracking-widest text-[#FF65A9] uppercase leading-none">COMBO</span>
              <div id="hud-combo-container" className="text-5xl md:text-6xl font-black italic tracking-tighter text-[#FF65A9] drop-shadow-[0_2px_12px_rgba(0,232,255,0.6)] animate-combo-pop select-none leading-none mt-1.5">
                <span id="hud-combo-text">{statsRef.current.combo}<span className="text-2xl font-black not-italic ml-1">x</span></span>
              </div>
              <div id="hud-max-combo" className="text-[9px] font-bold text-white/40 mt-1 uppercase font-mono tracking-wider">MAX: {statsRef.current.maxCombo}x</div>
            </div>
          </div>
        )}
        
        {/* Background Video or Image Behind under dims */}
        {beatmap.videoUrl ? (
          <video 
            ref={videoRef}
            src={beatmap.videoUrl} 
            className="absolute inset-0 w-full h-full object-cover transition-opacity pointer-events-none" 
            style={{ opacity: 1 - settings.dimLevel / 100 }}
            muted
            playsInline
            loop={false}
          />
        ) : beatmap.bgUrl ? (
          <img 
            src={beatmap.bgUrl} 
            className="absolute inset-0 w-full h-full object-cover transition-opacity" 
            style={{ opacity: 1 - settings.dimLevel / 100 }}
            alt="background"
            referrerPolicy="no-referrer"
          />
        ) : (
          // Falling grid matrix backdrops
          <div 
            className="absolute inset-0 opacity-10 bg-linear-to-b from-transparent to-pink-900/10"
            style={{ 
              backgroundImage: 'radial-gradient(ellipse at center, rgba(30, 30, 50, 0.5) 0%, rgba(10, 10, 14, 0.9) 100%), linear-gradient(rgba(236, 72, 153, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236, 72, 153, 0.05) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 30px 30px, 30px 30px'
            }}
          />
        )}

        {/* Gameplay rendering target */}
        <canvas 
          id="osu-gameplay-canvas"
          ref={canvasRef} 
          onTouchStart={(e) => {
            if (e.touches.length === 3) {
              setIsPausedMenuOpen(prev => !prev);
              handleTogglePlay();
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            activeDesktopKeysRef.current.m1 = false;
            activeDesktopKeysRef.current.m2 = false;
          }}
          onPointerMove={handlePointerMove}
          className="absolute inset-0 block w-full h-full"
        />

        {/* Mania Mobile Touch Buttons */}
        {settings.gameMode === 'mania' && settings.maniaMobileMode && (
          <div className="absolute inset-x-0 bottom-0 h-1/3 flex justify-center pb-6 px-4 pointer-events-none z-30">
            <div className="w-full max-w-lg flex gap-2 h-full pointer-events-auto">
              {[0, 1, 2, 3].map(lane => (
                <div
                  key={lane}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!activeManiaKeysRef.current[lane]) {
                      activeManiaKeysRef.current[lane] = true;
                      triggerManiaHit(lane);
                    }
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    activeManiaKeysRef.current[lane] = false;
                  }}
                  onPointerCancel={(e) => {
                    e.preventDefault();
                    activeManiaKeysRef.current[lane] = false;
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    activeManiaKeysRef.current[lane] = false;
                  }}
                  className="flex-1 bg-white/5 active:bg-white/20 border-t-4 border-[#00E8FF]/80 rounded-t-sm transition-colors backdrop-blur-sm touch-none"
                  style={{ touchAction: 'none' }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Autoplay Active Overlay */}
        {settings.autoPlay && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 text-xs font-mono tracking-widest uppercase rounded-full shadow-lg shadow-black/40 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span>
            <span>AUTO-PLAY MODUS AKTIV</span>
          </div>
        )}
      </div>

      {/* Fail Overlay Block */}
      {isFailed && (
        <div className="absolute inset-0 bg-[#0A0A0C]/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-5 z-55 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-500 flex items-center justify-center text-red-500 mb-4 animate-bounce">
            <Square className="w-8 h-8 fill-red-500" />
          </div>
          <h2 className="text-3xl font-black tracking-wider text-white mb-2 uppercase">FEHLGESCHLAGEN</h2>
          <p className="text-gray-450 text-sm max-w-sm mb-8">Deine Lebensenergie ist vollständig erschöpft. Probier es noch einmal!</p>

          <div className="flex items-center gap-4">
            <button
              id="btn-retry-failed"
              onClick={handleRestart}
              className="flex items-center gap-2 px-6 py-3 bg-[#00E8FF] hover:bg-[#ff86b8] active:scale-95 text-black font-black uppercase text-sm tracking-wider rounded-sm transition-all shadow-[0_0_20px_rgba(0,232,255,0.3)] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 stroke-[3px]" />
              <span>Retry</span>
            </button>
            <button
              id="btn-quit-failed"
              onClick={handleClose}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 border border-white/10 font-semibold rounded-sm text-sm transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Verlassen</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom control play panel */}
      {!settings.useFullSkin && (
        <div className="h-14 border-t border-white/[0.08] bg-[#0D0D10] flex items-center justify-between px-6 z-10 text-xs text-gray-400 font-mono">
          <div className="flex items-center gap-2">
            <span>STEUERUNG:</span>
            {settings.gameMode === 'mania' ? (
              <span className="px-2 py-0.5 bg-[#00E8FF]/10 border border-[#00E8FF]/25 rounded text-[#00E8FF] text-[10px] font-bold">MANIA MODUS ({settings.maniaMobileMode ? 'TOUCH BUTTONS' : 'D / F / J / K'})</span>
            ) : settings.disableClicking ? (
              <>
                <span className="px-2 py-0.5 bg-red-500/15 border border-red-500/35 rounded text-red-400 text-[10px] uppercase font-bold tracking-wider">Klicks deaktiviert</span>
                <span>– Nur</span>
                <span className="px-2 py-0.5 bg-[#00E8FF]/10 border border-[#00E8FF]/25 rounded text-[#00E8FF] text-[10px] font-bold animate-[pulse_1.5s_infinite]">Maus + Tastatur (X / Y / Z)</span>
              </>
            ) : (
              <>
                <span className="px-2 py-0.5 bg-white/5 rounded text-white text-[10px]">Tippen auf Kreise</span>
                {settings.useKeyboard && (
                  <>
                    <span>oder</span>
                    <span className="px-2 py-0.5 bg-white/5 rounded text-white text-[10px]">Tastatur (X / Y / Z Tasten)</span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button 
              id="btn-pause-toggle"
              onClick={handleTogglePlay}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#16161C] hover:bg-[#1f1f26] text-gray-300 rounded-sm border border-white/10 transition-colors cursor-pointer"
            >
              {isPlayingState ? (
                <>
                  <Pause className="w-3 h-3 text-[#00E8FF]" />
                  <span>Pausieren</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-[#00E8FF] fill-[#00E8FF]" />
                  <span>Fortsetzen</span>
                </>
              )}
            </button>
            
            <button 
              id="btn-restart-game"
              onClick={handleRestart}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#16161C] hover:bg-[#1f1f26] text-gray-300 rounded-sm border border-white/10 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-cyan-400" />
              <span>Neustart</span>
            </button>
          </div>
        </div>
      )}

      {/* Pause Menu Overlay */}
      {settings.useFullSkin && isPausedMenuOpen && (
        <div 
          className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-center"
          style={{
            backgroundImage: settings.customSkinImages?.['pause-overlayUrl'] ? `url(${settings.customSkinImages['pause-overlayUrl']})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="flex flex-col gap-4 items-center justify-center">
            <button
              onClick={() => {
                setIsPausedMenuOpen(false);
                if (!isPlayingState) handleTogglePlay();
              }}
              className="active:scale-95 transition-all cursor-pointer bg-transparent border-none outline-none p-0 flex items-center justify-center hover:brightness-110"
            >
              {settings.customSkinImages?.['pause-continueUrl'] ? (
                <img src={settings.customSkinImages['pause-continueUrl']} alt="Continue" className="h-12 md:h-16 lg:h-20 object-contain drop-shadow-md" />
              ) : (
                <div className="w-48 py-4 bg-white/10 hover:bg-white/20 rounded-sm border border-white/20 text-white font-bold tracking-widest uppercase text-center">Continue</div>
              )}
            </button>
            <button
              onClick={() => {
                setIsPausedMenuOpen(false);
                handleRestart();
              }}
              className="active:scale-95 transition-all cursor-pointer bg-transparent border-none outline-none p-0 flex items-center justify-center hover:brightness-110"
            >
              {settings.customSkinImages?.['pause-retryUrl'] ? (
                <img src={settings.customSkinImages['pause-retryUrl']} alt="Retry" className="h-12 md:h-16 lg:h-20 object-contain drop-shadow-md" />
              ) : (
                <div className="w-48 py-4 bg-white/10 hover:bg-[#00E8FF]/40 rounded-sm border border-white/20 text-[#00E8FF] hover:text-white font-bold tracking-widest uppercase text-center shadow-[0_0_15px_rgba(0,232,255,0.1)]">Retry</div>
              )}
            </button>
            <button
              onClick={() => {
                setIsPausedMenuOpen(false);
                cleanupAudio();
                handleClose();
              }}
              className="active:scale-95 transition-all cursor-pointer bg-transparent border-none outline-none p-0 flex items-center justify-center hover:brightness-110"
            >
              {settings.customSkinImages?.['pause-backUrl'] ? (
                <img src={settings.customSkinImages['pause-backUrl']} alt="Quit" className="h-12 md:h-16 lg:h-20 object-contain drop-shadow-md" />
              ) : (
                <div className="w-48 py-4 bg-white/10 hover:bg-red-500/40 rounded-sm border border-white/20 text-red-400 hover:text-white font-bold tracking-widest uppercase text-center shadow-[0_0_15px_rgba(239,68,68,0.1)]">Quit</div>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

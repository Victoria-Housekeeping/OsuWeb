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
  
  const startTimeRef = useRef<number>(0); // system timestamp corresponding to audio start
  const playheadMsRef = useRef<number>(0); // current duration in ms
  const pausedTimeMsRef = useRef<number>(0); // stored duration when paused

  // Game state
  const [stats, setStats] = useState<PlayStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    hp: 100,
    hits300: 0,
    hits100: 0,
    hits50: 0,
    misses: 0,
  });
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
  const lastFrameTimeRef = useRef<number>(0);

  // Spinner states
  const spinnerSpinsRef = useRef<number>(0);
  const lastSpinnerAngleRef = useRef<number | null>(null);
  const spinnerTargetGoalRef = useRef<number>(1);
  const [spinnerProgress, setSpinnerProgress] = useState<number | null>(null);

  // Colors
  const comboColors = [
    'rgb(236, 72, 153)',  // Neon Pink
    'rgb(6, 182, 212)',   // Electric Cyan
    'rgb(234, 179, 8)',   // Neon Yellow
    'rgb(34, 197, 94)',   // Acid Green
  ];

  // Map settings
  const circleSize = beatmap.circleSize;
  const hpDrain = beatmap.hpDrain;
  const approachRate = beatmap.approachRate;
  const overallDifficulty = beatmap.overallDifficulty;

  // Compute OSU standard sizes
  // Circle size (CS) formula. Standard circles have diameter in range [20, 80] osu pixels.
  // Playfield width is 512, height is 384.
  const baseCSSize = (109 - 9 * circleSize) * 0.7; // diameter on standard size
  
  // Hit windows based on OD
  const hit300Window = 80 - 6 * overallDifficulty;
  const hit100Window = 140 - 8 * overallDifficulty;
  const hit50Window = 200 - 10 * overallDifficulty;

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

  // Setup game
  useEffect(() => {
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

    // Keyboard bindings for Z / X alternate tap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z' || e.key === 'x' || e.key === 'X') {
        // Simulate tap at current laser pointer or pointer position on canvas
        // For ease of keyboard-mouse hybrid play, we trigger touch on the oldest active hit circle
        if (isPlayingRef.current && mousePosRef.current) {
          triggerClick(mousePosRef.current.x, mousePosRef.current.y);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

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
      cancelAnimationFrame(animId);
      cleanupAudio();
    };
  }, [beatmap, audioBuffer]);

  const mousePosRef = useRef<{ x: number; y: number } | null>(null);

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
    } else {
      // Resume
      playAudioTrack();
    }
  };

  const handleRestart = () => {
    // Reset state
    setIsFailed(false);
    setIsFinished(false);
    setStats({
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      hits300: 0,
      hits100: 0,
      hits50: 0,
      misses: 0,
    });
    statsRef.current = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      hits300: 0,
      hits100: 0,
      hits50: 0,
      misses: 0,
    };
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
    const baseScale = Math.min((canvasWidth - 100) / osuW, (canvasHeight - 120) / osuH);
    const scale = autoScaleField ? baseScale : (baseScale * uiScale);
    const offsetX = (canvasWidth - osuW * scale) / 2;
    const offsetY = (canvasHeight + 10 - osuH * scale) / 2;

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
    // Reduce health incrementally
    const curStats = statsRef.current;
    const passiveHpReduction = (hpDrain * 0.005) * (dt / 16.6); // scale with timescale/framerate
    let newHp = curStats.hp - passiveHpReduction;
    
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
        
        // If playhead surpasses the hit envelope frame
        if (playhead > obj.time + hit50Window && !isSliderHolding) {
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
    setStats(updated);
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
    if (scoreResult === 300) hpDiff = 8;
    else if (scoreResult === 100) hpDiff = 3;
    else if (scoreResult === 50) hpDiff = 1;
    else hpDiff = -15 * (hpDrain * 0.15 + 0.8); // Scale miss harm with difficulty setting

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
        color: comboColors[obj.comboSet],
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
    const hitRadius = (baseCSSize / 2 * 1.5) * objectScale; // generous hit box multiplier for flawless touchscreen play!
    const dx = clickedOsuX - oldest.x;
    const dy = clickedOsuY - oldest.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (oldest.type === 'spinner') {
      // In touch, spin is done by rotating, but we can also permit rapid alternative taps!
      // This increases spin index
      spinnerSpinsRef.current += 1;
      const progress = Math.min(1, spinnerSpinsRef.current / 15); // tap 15 times to clear!
      setSpinnerProgress(progress);
      
      if (progress >= 1) {
        triggerHit(oldest, 300);
        setSpinnerProgress(null);
      }
      return;
    }

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

    mousePosRef.current = { x: clickX, y: clickY };

    // Register visual trailing particle
    trailsRef.current.push({
      id: Math.random().toString(),
      x: clickX,
      y: clickY,
      timestamp: Date.now(),
    });

    triggerClick(clickX, clickY);
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
          if (dist < baseCSSize * 1.5 * objectScale) {
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
    const renderScale = settings.autoScaleField !== false ? (settings.uiScale || 1.0) : 1.0;
    const skin = settings.skinPreset || 'lazer';

    hitObjectsStateRef.current.forEach((obj) => {
      // Filter visibility
      const isVisible = playhead >= obj.time - approachDuration && playhead <= (obj.endTime || obj.time + 500);
      if (!isVisible) return;

      if (obj.type === 'slider' && obj.sliderPoints && obj.sliderPoints.length >= 2) {
        const color = comboColors[obj.comboSet];

        // Choose color for track
        let strokeColor = color;
        if (skin === 'custom' && settings.customSkinColors?.sliderTrackColor) {
          strokeColor = settings.customSkinColors.sliderTrackColor;
        }

        // Determine slider points configuration based on skin snaking/retraction settings
        let pointsToDraw = obj.sliderPoints;
        if (skin !== 'classic') {
          // If in approach stage: snake-in
          if (playhead < obj.time) {
            const ratioProgress = Math.max(0, Math.min(1, (playhead - (obj.time - approachDuration)) / approachDuration));
            pointsToDraw = getSliderPointsBetweenRatios(obj, 0, ratioProgress);
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
        const isVisible = playhead >= obj.time - approachDuration && playhead <= obj.time + hit50Window;
        return isVisible && !obj.isHit && obj.hitResult === null;
      })
      .reverse(); // Reverse so older items draw last (on top)

    objectsToDraw.forEach((obj) => {
      const color = comboColors[obj.comboSet];
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
        if (spinnerProgress !== null) {
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, spinRadius, -Math.PI / 2, -Math.PI / 2 + spinnerProgress * Math.PI * 2);
          ctx.strokeStyle = 'rgb(236, 72, 153)';
          ctx.lineWidth = 16 * drawScale;
          ctx.stroke();
        }

        // Draw prompt text
        ctx.font = `bold ${Math.floor(20 * drawScale)}px var(--font-sans)`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('SPIN! (Schnelles Tippen)', w / 2, h / 2 - 20 * drawScale);

        ctx.font = `${Math.floor(14 * drawScale)}px var(--font-mono)`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`${spinnerSpinsRef.current} / 15`, w / 2, h / 2 + 20 * drawScale);
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

      } else if (skin === 'custom' && settings.customSkinColors) {
        const fill = settings.customSkinColors.hitcircleFill || '#3b82f6';
        const border = settings.customSkinColors.hitcircleBorder || '#ffffff';

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.strokeStyle = border;
        ctx.lineWidth = 4 * scale * drawScale;
        ctx.stroke();

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
      } else {
        // Lazer / Classic / Custom
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

      // 2. Draw outer shrinking Approach Circle (only before hits)
      if (playhead < obj.time) {
        const timeRemaining = obj.time - playhead;
        const approachRatio = timeRemaining / approachDuration; // starts at 1, goes to 0 on target hit time
        
        const approachSizeMultiplier = 1.0 + approachRatio * 2.5; 
        const approachRadius = radius * approachSizeMultiplier;

        ctx.beginPath();
        ctx.arc(x, y, approachRadius, 0, Math.PI * 2);

        let aprColor = color;
        if (skin === 'custom' && settings.customSkinColors?.approachCircleColor) {
          aprColor = settings.customSkinColors.approachCircleColor;
        } else if (skin === 'whitecat') {
          aprColor = 'rgba(0, 229, 255, 0.85)'; // White Cat signature cyan approach circles
        } else if (skin === 'argon') {
          aprColor = color; // Matches Argon's glowing accents
        }
        ctx.strokeStyle = aprColor;
        ctx.lineWidth = (skin === 'lazer' || skin === 'argon' || skin === 'whitecat' ? 1.5 : 2.5) * scale * drawScale;
        ctx.stroke();
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
    floatersRef.current.forEach((f) => {
      const age = playhead - f.timestamp;
      const opacity = Math.max(0, 1 - age / 600);
      const dy = (age / 600) * 45 * drawScale; // float slowly upwards
      const fx = offsetX + f.x * scale;
      const fy = offsetY + f.y * scale - dy;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (f.result === 300) {
        ctx.fillStyle = `rgba(34, 197, 94, ${opacity})`;
        ctx.font = `bold ${Math.floor(28 * drawScale)}px var(--font-sans)`;
        ctx.fillText('300', fx, fy);
      } else if (f.result === 100) {
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;
        ctx.font = `bold ${Math.floor(24 * drawScale)}px var(--font-sans)`;
        ctx.fillText('100', fx, fy);
      } else if (f.result === 50) {
        ctx.fillStyle = `rgba(234, 179, 8, ${opacity})`;
        ctx.font = `bold ${Math.floor(20 * drawScale)}px var(--font-sans)`;
        ctx.fillText('50', fx, fy);
      } else {
        // Miss! Render a nice red cross
        ctx.fillStyle = `rgba(239, 68, 68, ${opacity})`;
        ctx.font = `bold ${Math.floor(26 * drawScale)}px var(--font-sans)`;
        ctx.fillText('✕', fx, fy);
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
  };

  // Compute live play accuracy percentage
  const getAccuracy = () => {
    const totalHits = stats.hits300 + stats.hits100 + stats.hits50 + stats.misses;
    if (totalHits === 0) return 100;
    
    const possibleMax = totalHits * 300;
    const actual = stats.hits300 * 300 + stats.hits100 * 100 + stats.hits50 * 50;
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
    const scoreStr = stats.score.toString().padStart(8, '0');
    const firstNonZero = scoreStr.search(/[1-9]/);
    if (firstNonZero === -1) {
      return <span className="font-mono text-xl md:text-2xl text-white/30 font-extrabold tracking-wider">{scoreStr}</span>;
    }
    const leading = scoreStr.slice(0, firstNonZero);
    const active = scoreStr.slice(firstNonZero);
    return (
      <span className="font-mono text-xl md:text-2xl tracking-wider font-extrabold">
        <span className="text-white/35">{leading}</span>
        <span className="text-white drop-shadow-[0_0_10px_rgba(255,102,170,0.7)]">{active}</span>
      </span>
    );
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0A0A0E] flex flex-col select-none overflow-hidden text-white font-sans">
      
      {/* Dynamic inline-styled animations keyframes matching osu!lazer */}
      <style>{`
        @keyframes comboPop {
          0% { transform: scale(1.23) rotate(-2deg); text-shadow: 0 0 16px rgba(255,102,170,0.85); }
          100% { transform: scale(1) rotate(0deg); text-shadow: 0 0 5px rgba(255,102,170,0.3); }
        }
        .animate-combo-pop {
          animation: comboPop 0.14s cubic-bezier(0.18, 0.89, 0.32, 1.25) forwards;
        }
      `}</style>

      {/* Laser HP Bar spanning the absolute top width of the screen */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/45 z-30">
        <div 
          className={`h-full transition-all duration-75 shadow-[0_0_10px_rgba(255,102,170,0.8)] ${
            stats.hp < 30 
              ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_14px_rgba(239,68,68,0.95)] animate-pulse' 
              : 'bg-gradient-to-r from-[#FF3399] via-[#FF66AA] to-[#FF99CC]'
          }`}
          style={{ width: `${stats.hp}%` }}
        />
      </div>

      {/* Top Hud Bar */}
      <div className="h-16 border-b border-white/[0.05] bg-[#121216] flex items-center justify-between px-6 z-10 animate-fade-in relative shadow-[0_4px_25px_rgba(0,0,0,0.4)]">
        
        {spectatingReplayName && (
          <div className="absolute left-1/2 -translate-x-1/2 z-20 bg-[#FF66AA]/10 border border-[#FF66AA]/20 text-[#FF66AA] px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(255,102,170,0.2)] backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-[#FF66AA] animate-pulse" />
            <span>SPECTATING REPLAY: {spectatingReplayName}</span>
          </div>
        )}

        {/* Info & Exit Button */}
        <div className="flex items-center gap-4">
          <button 
            id="btn-quit-game"
            onClick={() => {
              cleanupAudio();
              onClose();
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-gray-200 font-extrabold uppercase tracking-wider transition-all cursor-pointer hover:border-[#FF66AA]/30"
          >
            <X className="w-4 h-4 text-[#FF66AA]" />
            <span>Beenden</span>
          </button>
          
          <div className="hidden lg:block border-l border-white/10 pl-4">
            <h1 className="text-xs font-black tracking-widest leading-none text-[#FF66AA] uppercase">SPIELT GERADE</h1>
            <h2 className="text-sm font-bold tracking-tight text-white mt-1 line-clamp-1">{beatmap.title} <span className="opacity-50 text-xs font-medium">[{beatmap.version}]</span></h2>
          </div>
        </div>

        {/* Live Score stats */}
        <div className="flex items-center gap-10">
          
          {/* Accuracy Tickers */}
          <div className="text-right">
            <div className="text-[9px] font-black font-mono text-gray-500 tracking-widest uppercase">ACCURACY</div>
            <div className="text-lg md:text-xl font-black font-mono text-cyan-400 mt-0.5 tracking-tight">{getAccuracy()}%</div>
          </div>

          {/* Leading Score Display Column */}
          <div className="text-right min-w-[120px]">
            <div className="text-[9px] font-black font-mono text-gray-500 tracking-widest uppercase mb-0.5">SCORE</div>
            {renderFormattedScore()}
          </div>

        </div>
      </div>

      {/* Gameplay Canvas Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-radial from-[#12121b] to-[#08080c] overflow-hidden cursor-crosshair"
      >
        
        {/* Giant bottom-left combo counter overlay matching osu!lazer */}
        <div className="absolute bottom-6 left-8 pointer-events-none z-25 select-none font-sans">
          <div className="flex flex-col items-start bg-black/25 backdrop-blur-sm p-4 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black font-mono tracking-widest text-[#FF65A9] uppercase leading-none">COMBO</span>
            <div key={stats.combo} className="text-5xl md:text-6xl font-black italic tracking-tighter text-[#FF65A9] drop-shadow-[0_2px_12px_rgba(255,102,170,0.6)] animate-combo-pop select-none leading-none mt-1.5">
              {stats.combo}<span className="text-2xl font-black not-italic ml-1">x</span>
            </div>
            <div className="text-[9px] font-bold text-white/40 mt-1 uppercase font-mono tracking-wider">MAX: {stats.maxCombo}x</div>
          </div>
        </div>
        
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="absolute inset-0 block w-full h-full"
        />

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
        <div className="absolute inset-0 bg-[#0A0A0C]/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-55 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-500 flex items-center justify-center text-red-500 mb-4 animate-bounce">
            <Square className="w-8 h-8 fill-red-500" />
          </div>
          <h2 className="text-3xl font-black tracking-wider text-white mb-2 uppercase">FEHLGESCHLAGEN</h2>
          <p className="text-gray-450 text-sm max-w-sm mb-8">Deine Lebensenergie ist vollständig erschöpft. Probier es noch einmal!</p>

          <div className="flex items-center gap-4">
            <button
              id="btn-retry-failed"
              onClick={handleRestart}
              className="flex items-center gap-2 px-6 py-3 bg-[#FF66AA] hover:bg-[#ff86b8] active:scale-95 text-black font-black uppercase text-sm tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(255,102,170,0.3)] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 stroke-[3px]" />
              <span>Retry</span>
            </button>
            <button
              id="btn-quit-failed"
              onClick={onClose}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 border border-white/10 font-semibold rounded-xl text-sm transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Verlassen</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom control play panel */}
      <div className="h-14 border-t border-white/[0.08] bg-[#0D0D10] flex items-center justify-between px-6 z-10 text-xs text-gray-400 font-mono">
        <div className="flex items-center gap-2">
          <span>STEUERUNG:</span>
          <span className="px-2 py-0.5 bg-white/5 rounded text-white text-[10px]">Tippen auf Kreise</span>
          {settings.useKeyboard && (
            <>
              <span>oder</span>
              <span className="px-2 py-0.5 bg-white/5 rounded text-white text-[10px]">Z / X Tasten</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button 
            id="btn-pause-toggle"
            onClick={handleTogglePlay}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#16161C] hover:bg-[#1f1f26] text-gray-300 rounded-lg border border-white/10 transition-colors cursor-pointer"
          >
            {isPlayingState ? (
              <>
                <Pause className="w-3 h-3 text-[#FF66AA]" />
                <span>Pausieren</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-[#FF66AA] fill-[#FF66AA]" />
                <span>Fortsetzen</span>
              </>
            )}
          </button>
          
          <button 
            id="btn-restart-game"
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#16161C] hover:bg-[#1f1f26] text-gray-300 rounded-lg border border-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" />
            <span>Neustart</span>
          </button>
        </div>
      </div>
    </div>
  );
};

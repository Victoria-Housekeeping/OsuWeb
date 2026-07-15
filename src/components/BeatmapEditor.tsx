import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, MousePointer2, Circle, RotateCw, Grid,
  Sparkles, Wind, Zap, Waves, LayoutGrid, Ruler,
  Play, Pause, ChevronLeft, ChevronRight,
  Settings, Layers, Clock, CheckCircle2,
  Save, Download, FileAudio, FileImage, Volume2, SlidersHorizontal,
  Palette, MoreVertical, Menu, Move, RotateCcw, Scaling, Check, Search, Type, Activity
} from 'lucide-react';
import { Beatmap, MapGroup, HitObject } from '../types';
import { GameCanvas } from './GameCanvas';

interface BeatmapEditorProps {
  group: MapGroup;
  versionIdx: number;
  onClose: () => void;
}

export const BeatmapEditor: React.FC<BeatmapEditorProps> = ({ group, versionIdx, onClose }) => {
  const version = group.versions[versionIdx];
  const [activeTab, setActiveTab] = useState<'setup' | 'compose' | 'design' | 'timing' | 'verify'>('compose');
  const [activeTool, setActiveTool] = useState<'select' | 'circle' | 'slider' | 'spinner' | 'grid'>('circle');
  const [activeToggles, setActiveToggles] = useState<Record<string, boolean>>({
    newCombo: true,
    gridSnap: true,
    distanceSnap: true,
  });
  
  const [showComboColors, setShowComboColors] = useState(false);


  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hitObjects, setHitObjects] = useState<HitObject[]>(version.hitObjects || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Accent colors from screenshot
  const comboColors = ['#e63982', '#39e66b', '#ff4dd2'];
  const [activeComboColor, setActiveComboColor] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(version.audioUrl || null);
  const [bgUrl, setBgUrl] = useState<string | null>(version.bgUrl || null);
  const [videoUrl, setVideoUrl] = useState<string | null>(version.videoUrl || null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objectId: string } | null>(null);

  useEffect(() => {
    let active = true;
    const loadAudioBuffer = async () => {
      try {
        let usedBlob = version.audioBlob || null;
        if (!usedBlob && version.audioFilename && group.fileName) {
          const { getOszFile } = await import('../utils/db');
          const { extractFileFromOsz } = await import('../utils/osuParser');
          const oszBlob = await getOszFile(group.fileName);
          if (oszBlob) {
            usedBlob = await extractFileFromOsz(oszBlob, version.audioFilename);
          }
        }
        
        if (version.id === 'built-in-synthwave-tutorial') {
          const { generateAudioBufferForBeatmap } = await import('../utils/audioSynth');
          const buffer = await generateAudioBufferForBeatmap();
          if (active) setAudioBuffer(buffer);
        } else if (usedBlob) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await usedBlob.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          ctx.close();
          if (active) setAudioBuffer(buffer);
        }
      } catch (err) {
        console.error('Error loading audio buffer in editor:', err);
      }
    };
    loadAudioBuffer();
    return () => {
      active = false;
    };
  }, [version, group]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);
  
  const handleUpdateSelectedObject = (key: keyof HitObject, value: any) => {
    if (selectedIds.size === 0) return;
    setHitObjects(prev => prev.map(obj => {
      if (selectedIds.has(obj.id)) {
        return { ...obj, [key]: value };
      }
      return obj;
    }));
  };

  const duration = version.duration || 100000;

  const editorBeatmap = useMemo(() => ({
    ...version,
    hitObjects: hitObjects
  }), [version, hitObjects]);

  const editorSettings = useMemo(() => ({
    gameMode: 'standard' as const,
    autoPlay: true,
    touchControls: false,
    hitsounds: true,
    volume: 0.8,
    dimLevel: 40,
    useKeyboard: true,
    showFps: false,
    uiScale: 1.0,
    autoScaleField: true,
    audioOffset: 0,
    skinPreset: 'standard'
  }), []);

  // Unified animation loop for playback time tracking
  useEffect(() => {
    if (audioBuffer) return;
    let animFrame: number;
    let lastTime = performance.now();
    
    const loop = (now: number) => {
      if (isPlaying) {
        const dt = now - lastTime;
        setCurrentTime(prev => {
          let nextTime = prev + dt;
          if (nextTime > duration) {
            setIsPlaying(false);
            if (audioRef.current) audioRef.current.pause();
            if (videoRef.current) videoRef.current.pause();
            return duration;
          }
          return nextTime;
        });
      }
      lastTime = now;
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, duration, audioBuffer]);

  // Sync audio/video elements when play/pause state changes
  useEffect(() => {
    if (audioBuffer) return;
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.currentTime = currentTime / 1000;
      audioRef.current.play().catch(() => setIsPlaying(false));
      if (videoRef.current) {
        videoRef.current.currentTime = currentTime / 1000;
        videoRef.current.play().catch(() => {});
      }
    } else {
      audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
    }
  }, [isPlaying, audioBuffer]);

  // Keep audio/video synced with currentTime when paused
  useEffect(() => {
    if (audioBuffer) return;
    if (!isPlaying) {
      if (audioRef.current) {
        const drift = Math.abs(audioRef.current.currentTime - currentTime / 1000);
        if (drift > 0.05) {
          audioRef.current.currentTime = currentTime / 1000;
        }
      }
      if (videoRef.current) {
        const drift = Math.abs(videoRef.current.currentTime - currentTime / 1000);
        if (drift > 0.05) {
          videoRef.current.currentTime = currentTime / 1000;
        }
      }
    }
  }, [currentTime, isPlaying, audioBuffer]);

  const currentSnapDivisor = 4;

  // Unified keyboard event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        if (selectedIds.size > 0) {
          setHitObjects(prev => prev.filter(obj => !selectedIds.has(obj.id)));
          setSelectedIds(new Set());
        }
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const tps = version.timingPoints && version.timingPoints.length > 0 ? version.timingPoints.filter(t => t.uninherited) : [];
        const activeTp = tps.slice().reverse().find(t => t.time <= currentTime) || tps[0];
        if (activeTp) {
          const beatLen = activeTp.beatLength;
          let snapStep = beatLen / currentSnapDivisor;
          if (e.ctrlKey) snapStep = beatLen; // 1/4 note (white line)
          
          let dir = e.code === 'ArrowRight' ? 1 : -1;
          let newTime = currentTime + snapStep * dir;
          // Align to grid
          const offset = (newTime - activeTp.time) % snapStep;
          if (Math.abs(offset) > 1) {
             newTime -= offset;
             if (dir > 0 && offset < 0) newTime += snapStep;
             if (dir < 0 && offset > 0) newTime -= snapStep;
          }
          
          const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : duration;
          newTime = Math.max(0, Math.min(newTime, maxDur));
          setCurrentTime(newTime);
        }
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const sorted = [...hitObjects].sort((a,b) => a.time - b.time);
        if (e.code === 'ArrowUp') { // forward
          const next = sorted.find(h => h.time > currentTime + 5);
          if (next) {
             setCurrentTime(next.time);
          }
        } else { // backward
          const prev = sorted.slice().reverse().find(h => h.time < currentTime - 5);
          if (prev) {
             setCurrentTime(prev.time);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, hitObjects, version.timingPoints, selectedIds, duration]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!isPlaying) {
       const delta = e.deltaY > 0 ? 100 : -100;
       const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : duration;
       const newTime = Math.max(0, Math.min(currentTime + delta, maxDur));
       setCurrentTime(newTime);
    }
  };

  const renderTimeline = () => {
    const viewWidthMs = 4000;
    const halfWidth = viewWidthMs / 2;
    const startTime = currentTime - halfWidth;
    const endTime = currentTime + halfWidth;
    
    // Find active timing point
    const tps = version.timingPoints && version.timingPoints.length > 0 ? version.timingPoints.filter(t => t.uninherited) : [];
    const activeTp = tps.slice().reverse().find(t => t.time <= endTime) || tps[0];
    
    let ticks = [];
    if (activeTp) {
      const beatLen = activeTp.beatLength;
      const firstBeat = Math.floor((startTime - activeTp.time) / beatLen) * 4;
      const lastBeat = Math.ceil((endTime - activeTp.time) / beatLen) * 4;
      
      for (let i = firstBeat; i <= lastBeat; i++) {
        const tickTime = activeTp.time + (i * beatLen / 4);
        if (tickTime >= startTime && tickTime <= endTime) {
          ticks.push({ time: tickTime, index: i });
        }
      }
    }
    
    const getLeft = (t) => `${((t - startTime) / viewWidthMs) * 100}%`;

    return (
      <div 
        className="h-14 bg-[#1a1c20] border-b border-[#30363d] relative overflow-hidden select-none cursor-ew-resize timeline-container"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDraggingTimeline(true);
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          setCurrentTime(startTime + percent * viewWidthMs);
        }}
        onPointerMove={(e) => {
          if (isDraggingTimeline) {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            setCurrentTime(startTime + percent * viewWidthMs);
          }
        }}
        onPointerUp={(e) => {
          setIsDraggingTimeline(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        {/* Timeline lines */}
        {ticks.map((tick, i) => {
          let color = '#3b82f6';
          let height = 'h-3';
          let mt = 'mt-5.5';
          if (tick.index % 4 === 0) { color = '#ffffff'; height = 'h-8'; mt = 'mt-3'; }
          else if (tick.index % 2 === 0) { color = '#ef4444'; height = 'h-5'; mt = 'mt-4.5'; }
          
          return (
            <div 
              key={`tick-${i}`}
              className={`absolute top-0 w-0.5 ${height} ${mt}`}
              style={{ left: getLeft(tick.time), backgroundColor: color }}
            />
          );
        })}
        
        {/* HitObjects on timeline */}
        {hitObjects.map(obj => {
          if (obj.time < startTime || obj.time > endTime) return null;
          const color = comboColors[obj.comboSet % comboColors.length] || comboColors[0];
          const isSelected = selectedIds.has(obj.id);
          
          // Slider duration
          let duration = 0;
          if (obj.type === 'slider' && obj.sliderLength) {
             const sliderVelocity = version.sliderMultiplier || 1.4;
             const beatLen = activeTp ? activeTp.beatLength : 500;
             duration = obj.sliderLength / (sliderVelocity * 100) * beatLen;
          }
          if (obj.type === 'spinner') {
             duration = obj.duration || 0;
          }
          
          return (
            <div 
              key={obj.id}
              className={`absolute top-2 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-transform cursor-pointer hover:scale-105 ${isSelected ? 'ring-2 ring-white z-10' : 'z-0'}`}
              style={{ 
                left: getLeft(obj.time), 
                backgroundColor: color, 
                width: duration > 0 ? `${(duration / viewWidthMs) * 100}%` : '40px',
                transform: duration > 0 ? '' : 'translateX(-50%)',
                minWidth: duration > 0 ? '40px' : ''
              }}
            >
              {obj.comboIndex + 1}
            </div>
          );
        })}
        
        {/* Center cursor */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 left-1/2 -translate-x-1/2 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.5)] z-20" />
      </div>
    );
  };

  const toggleToggle = (id: string) => {
    setActiveToggles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePlayfieldPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(512, ((e.clientX - rect.left) / rect.width) * 512));
    const y = Math.max(0, Math.min(384, ((e.clientY - rect.top) / rect.height) * 384));

    if (activeTool === 'circle') {
      const newObj: HitObject = {
        id: Math.random().toString(36).slice(2),
        x,
        y,
        time: currentTime,
        type: 'circle',
        comboIndex: hitObjects.filter(o => o.time < currentTime && o.comboSet === activeComboColor).length,
        comboSet: activeComboColor
      };
      setHitObjects(prev => [...prev, newObj].sort((a, b) => a.time - b.time));
    } else if (activeTool === 'slider') {
      const newObj: HitObject = {
        id: Math.random().toString(36).slice(2),
        x,
        y,
        time: currentTime,
        type: 'slider',
        comboIndex: hitObjects.filter(o => o.time < currentTime && o.comboSet === activeComboColor).length,
        comboSet: activeComboColor,
        sliderLength: 150,
        repeatCount: 1,
        sliderPoints: [
          { x: Math.min(512, x + 75), y: Math.min(384, y + 20) }, // curved slightly
          { x: Math.min(512, x + 150), y }
        ]
      };
      setHitObjects(prev => [...prev, newObj].sort((a, b) => a.time - b.time));
      setSelectedIds(new Set([newObj.id])); // Auto-select for inspection
    } else if (activeTool === 'spinner') {
      const newObj: HitObject = {
        id: Math.random().toString(36).slice(2),
        x: 256,
        y: 192,
        time: currentTime,
        type: 'spinner',
        comboIndex: hitObjects.filter(o => o.time < currentTime && o.comboSet === activeComboColor).length,
        comboSet: activeComboColor,
        duration: 2000
      };
      setHitObjects(prev => [...prev, newObj].sort((a, b) => a.time - b.time));
      setSelectedIds(new Set([newObj.id])); // Auto-select for inspection
    } else if (activeTool === 'select') {
      setSelectedIds(new Set());
    }
  };

  const handleObjectPointerDown = (e: React.PointerEvent, obj: HitObject) => {
    e.stopPropagation();
    if (activeTool === 'select') {
      setSelectedIds(new Set([obj.id]));
      setIsDragging(true);
      const rect = (e.target as Element).closest('.playfield-container')?.getBoundingClientRect();
      if (rect) {
        const ptrX = ((e.clientX - rect.left) / rect.width) * 512;
        const ptrY = ((e.clientY - rect.top) / rect.height) * 384;
        setDragOffset({ x: ptrX - obj.x, y: ptrY - obj.y });
      }
    }
  };

  const handleObjectContextMenu = (e: React.MouseEvent, obj: HitObject) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.closest('.playfield-container')?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setContextMenu({ x, y, objectId: obj.id });
    }
  };


  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingTimeline && selectedIds.size > 0) {
      const deltaX = e.clientX - dragOffset.x;
      // viewWidthMs = 4000, timeline width is roughly window.innerWidth - 400 (just approximation)
      // let's just use a simple ratio: 100px = 500ms
      const deltaMs = deltaX * 5; 
      
      setHitObjects(prev => prev.map(obj => {
        if (selectedIds.has(obj.id)) {
          let newTime = obj.time + deltaMs;
          if (activeToggles.gridSnap && version.timingPoints) {
            const tps = version.timingPoints.filter(t => t.uninherited);
            const tp = tps.slice().reverse().find(t => t.time <= newTime) || tps[0];
            if (tp) {
               const snapMs = tp.beatLength / currentSnapDivisor;
               newTime = tp.time + Math.round((newTime - tp.time) / snapMs) * snapMs;
            }
          }
          return { ...obj, time: Math.max(0, newTime) };
        }
        return obj;
      }));
      setDragOffset({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDragging && selectedIds.size > 0 && activeTool === 'select') {
      const rect = e.currentTarget.getBoundingClientRect();
      const ptrX = ((e.clientX - rect.left) / rect.width) * 512;
      const ptrY = ((e.clientY - rect.top) / rect.height) * 384;
      
      setHitObjects(prev => prev.map(obj => {
        if (selectedIds.has(obj.id)) {
          const targetX = Math.max(0, Math.min(512, ptrX - dragOffset.x));
          const targetY = Math.max(0, Math.min(384, ptrY - dragOffset.y));
          const dx = targetX - obj.x;
          const dy = targetY - obj.y;

          let updatedPoints = obj.sliderPoints;
          if (obj.type === 'slider' && obj.sliderPoints) {
            updatedPoints = obj.sliderPoints.map(p => ({
              x: Math.max(0, Math.min(512, p.x + dx)),
              y: Math.max(0, Math.min(384, p.y + dy))
            }));
          }

          return {
            ...obj,
            x: targetX,
            y: targetY,
            sliderPoints: updatedPoints
          };
        }
        return obj;
      }));
    }
  };

  const handlePointerUp = () => {
    setIsDraggingTimeline(false);
    setIsDragging(false);
  };

  const formatTime = (ms: number) => {
    const totalMs = Math.floor(ms);
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const mls = totalMs % 1000;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${mls.toString().padStart(3, '0')}`;
  };

  const TopMenu = () => (
    <div className="h-10 bg-[#22262b] border-b border-[#30363d] flex items-center justify-between px-2 text-sm z-40 relative">
      <div className="flex items-center space-x-1">
        <button onClick={onClose} className="text-gray-400 hover:text-white mr-2">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center text-white font-bold tracking-tight text-lg mr-4 opacity-90">
          <Circle size={16} className="text-[#fce07a] mr-1.5" /> osu!editor
        </div>
        
        {/* Dropdowns */}
        <div className="relative group">
          <button className="px-3 py-1 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors text-sm font-medium">Datei</button>
          <div className="absolute left-0 top-full mt-0 w-64 bg-[#2b3036] border border-[#404850] shadow-xl rounded-b shadow-black/50 hidden group-hover:block z-50">
            <div className="py-1">
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between">Neuen Schwierigkeitsgrad anlegen <ChevronRight size={14}/></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between">Schwierigkeitsgrad wechseln <ChevronRight size={14}/></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-red-400 cursor-pointer mb-1 border-b border-white/10">Schwierigkeitsgrad löschen</div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between">Speichern <span className="text-gray-500 text-xs">CTRL-S</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-red-400 cursor-pointer flex justify-between mb-1 border-b border-white/10">Ungespeicherte Änderungen verwerfen <span className="text-red-500/50 text-xs">CTRL-L</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between">Exportieren <ChevronRight size={14}/></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between">Extern bearbeiten <span className="text-gray-500 text-xs">CTRL-SHIFT-O</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer flex justify-between mb-1 border-b border-white/10">Beatmap hochladen <span className="text-gray-500 text-xs">CTRL-SHIFT-U</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer">Beatmap-Informationsseite öffnen</div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer mb-1 border-b border-white/10">Beatmap-Diskussionsseite öffnen</div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-200 cursor-pointer" onClick={onClose}>Beenden</div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <button className="px-3 py-1 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors text-sm font-medium">Bearbeiten</button>
          <div className="absolute left-0 top-full mt-0 w-64 bg-[#2b3036] border border-[#404850] shadow-xl rounded-b shadow-black/50 hidden group-hover:block z-50">
            <div className="py-1">
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between">Rückgängig machen <span className="text-gray-600 text-xs">CTRL-Z</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between mb-1 border-b border-white/10">Wiederherstellen <span className="text-gray-600 text-xs">CTRL-SHIFT-Y</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between">Ausschneiden <span className="text-gray-600 text-xs">CTRL-X</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between">Kopieren <span className="text-gray-600 text-xs">CTRL-C</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between">Einfügen <span className="text-gray-600 text-xs">CTRL-V</span></div>
              <div className="px-4 py-1.5 hover:bg-white/10 text-gray-500 cursor-not-allowed flex justify-between">Klonen <span className="text-gray-600 text-xs">CTRL-D</span></div>
            </div>
          </div>
        </div>
        <button className="px-3 py-1 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors text-sm font-medium">Ansicht</button>
        <button className="px-3 py-1 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors text-sm font-medium">Timing</button>
      </div>

      <div className="flex items-center space-x-1">
        {['einrichten', 'komponieren', 'design', 'timing', 'überprüfen'].map(tab => {
          const isActive = tab === (activeTab === 'setup' ? 'einrichten' : activeTab === 'compose' ? 'komponieren' : activeTab === 'verify' ? 'überprüfen' : activeTab);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab === 'einrichten' ? 'setup' : tab === 'komponieren' ? 'compose' : tab === 'überprüfen' ? 'verify' : tab as any)}
              className={`px-4 py-1.5 text-[13px] font-bold tracking-wide uppercase ${isActive ? 'bg-white text-black rounded-sm' : 'text-gray-400 hover:text-white'}`}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );

  const LeftSidebar = () => (
    <div className="w-[200px] bg-[#22262b] border-r border-[#30363d] flex flex-col select-none overflow-y-auto custom-scrollbar relative z-30">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2 mt-1">
          <span className="text-[11px] font-bold text-gray-400">TOOLBOX (1-9)</span>
          <Menu size={14} className="text-gray-400 cursor-pointer" />
        </div>
        <div className="flex flex-col gap-1">
          {[
            { id: 'select', label: 'Select', icon: MousePointer2, disabled: false },
            { id: 'circle', label: 'Hit circle', icon: Circle, disabled: false },
            { id: 'slider', label: 'Slider', icon: Activity, disabled: true },
            { id: 'spinner', label: 'Spinner', icon: RotateCw, disabled: true },
            { id: 'grid', label: 'Grid', icon: Grid, disabled: false },
          ].map(tool => {
            const isDisabled = tool.disabled;
            return (
              <button
                key={tool.id}
                disabled={isDisabled}
                onClick={() => !isDisabled && setActiveTool(tool.id as any)}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                  isDisabled
                    ? 'opacity-30 cursor-not-allowed bg-[#1c2024] text-gray-500'
                    : activeTool === tool.id
                      ? 'bg-[#354641] text-[#a0d8b8]'
                      : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
                }`}
              >
                <tool.icon size={16} className={isDisabled ? 'text-gray-600' : activeTool === tool.id ? 'text-[#a0d8b8]' : 'text-gray-400'} />
                {tool.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-6 mb-2">
          <span className="text-[11px] font-bold text-gray-400">TOGGLES (Q~P)</span>
          <Menu size={14} className="text-gray-400 cursor-pointer" />
        </div>
        <div className="flex flex-col gap-1 relative">
          <div className="flex gap-1 relative">
            <button
              onClick={() => toggleToggle('newCombo')}
              className={`flex-1 flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                activeToggles.newCombo ? 'bg-[#354641] text-[#a0d8b8]' : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
              }`}
            >
              <Sparkles size={16} className={activeToggles.newCombo ? 'text-[#a0d8b8]' : 'text-gray-400'} />
              New combo
            </button>
            <button 
              onClick={() => setShowComboColors(!showComboColors)}
              className="w-8 rounded bg-[#2a2f35] flex items-center justify-center hover:bg-[#32383f]"
            >
              <Palette size={14} className="text-gray-400" />
            </button>
            
            {showComboColors && (
              <div className="absolute top-10 right-0 bg-[#2a2f35] border border-[#30363d] rounded shadow-xl p-2 z-50 flex gap-2">
                {comboColors.map((color, i) => (
                  <button
                    key={color}
                    onClick={() => {
                      setActiveComboColor(i);
                      setShowComboColors(false);
                    }}
                    className={`w-6 h-6 rounded-full border-2 ${activeComboColor === i ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>
          {[
            { id: 'gridSnap', label: 'Grid snap', icon: LayoutGrid },
            { id: 'distanceSnap', label: 'Distance snap', icon: Ruler },
          ].map(toggle => (
            <button
              key={toggle.id}
              onClick={() => toggleToggle(toggle.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                activeToggles[toggle.id] ? 'bg-[#354641] text-[#a0d8b8]' : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
              }`}
            >
              <toggle.icon size={16} className={activeToggles[toggle.id] ? 'text-[#a0d8b8]' : 'text-gray-400'} />
              {toggle.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const RightSidebar = () => {
    const selectedObject = hitObjects.find(obj => selectedIds.has(obj.id));
    
    return (
      <div className="w-[320px] bg-[#22262b] border-l border-[#30363d] flex flex-col select-none overflow-y-auto custom-scrollbar relative z-30">
        {/* Object Inspector Section */}
        <div className="p-4 border-b border-[#30363d] flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#a0d8b8] font-bold text-xs uppercase tracking-wider mb-1">
            <SlidersHorizontal size={14} />
            <span>Objekt-Inspektor</span>
          </div>
          
          {selectedObject ? (
            <div className="flex flex-col gap-3.5 text-sm text-gray-300">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Typ</span>
                <span className="bg-[#2a2f35] px-2.5 py-1 rounded text-xs font-bold text-[#fdb438] capitalize">
                  {selectedObject.type === 'circle' ? 'Hit Circle' : selectedObject.type}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Zeitpunkt</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={Math.round(selectedObject.time)}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) handleUpdateSelectedObject('time', Math.max(0, val));
                    }}
                    className="w-24 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none focus:border-[#a0d8b8]"
                  />
                  <span className="text-xs text-gray-500">ms</span>
                </div>
              </div>
              
              {/* Millisecond tuning buttons */}
              <div className="flex gap-1 justify-end">
                {[-10, -1, 1, 10].map(diff => (
                  <button
                    key={diff}
                    onClick={() => {
                      handleUpdateSelectedObject('time', Math.max(0, Math.round(selectedObject.time + diff)));
                    }}
                    className="bg-[#2a2f35] hover:bg-[#32383f] active:bg-[#3c434b] text-gray-300 font-mono text-[10px] px-1.5 py-1 rounded border border-[#30363d] transition-colors"
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Position X</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="512"
                      value={Math.round(selectedObject.x)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) handleUpdateSelectedObject('x', Math.max(0, Math.min(512, val)));
                      }}
                      className="w-20 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none"
                    />
                    <span className="text-xs text-gray-500">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="512"
                  value={Math.round(selectedObject.x)}
                  onChange={(e) => handleUpdateSelectedObject('x', Number(e.target.value))}
                  className="w-full accent-[#a0d8b8] h-1 bg-[#1a1c20] rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Position Y</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="384"
                      value={Math.round(selectedObject.y)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) handleUpdateSelectedObject('y', Math.max(0, Math.min(384, val)));
                      }}
                      className="w-20 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none"
                    />
                    <span className="text-xs text-gray-500">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="384"
                  value={Math.round(selectedObject.y)}
                  onChange={(e) => handleUpdateSelectedObject('y', Number(e.target.value))}
                  className="w-full accent-[#a0d8b8] h-1 bg-[#1a1c20] rounded-lg cursor-pointer"
                />
              </div>

              {selectedObject.type === 'slider' && (
                <>
                  <div className="flex flex-col gap-1.5 border-t border-[#30363d]/50 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Slider-Länge</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="50"
                          max="1000"
                          value={Math.round(selectedObject.sliderLength || 150)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!isNaN(val)) handleUpdateSelectedObject('sliderLength', Math.max(50, Math.min(1000, val)));
                          }}
                          className="w-20 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none"
                        />
                        <span className="text-xs text-gray-500">px</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1000"
                      value={Math.round(selectedObject.sliderLength || 150)}
                      onChange={(e) => handleUpdateSelectedObject('sliderLength', Number(e.target.value))}
                      className="w-full accent-[#a0d8b8] h-1 bg-[#1a1c20] rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Wiederholungen</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={selectedObject.repeatCount || 1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!isNaN(val)) handleUpdateSelectedObject('repeatCount', Math.max(1, Math.min(10, val)));
                          }}
                          className="w-20 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none"
                        />
                        <span className="text-xs text-gray-500">x</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={selectedObject.repeatCount || 1}
                      onChange={(e) => handleUpdateSelectedObject('repeatCount', Number(e.target.value))}
                      className="w-full accent-[#a0d8b8] h-1 bg-[#1a1c20] rounded-lg cursor-pointer"
                    />
                  </div>
                </>
              )}

              {selectedObject.type === 'spinner' && (
                <div className="flex flex-col gap-1.5 border-t border-[#30363d]/50 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Spinner-Dauer</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="500"
                        max="10000"
                        value={Math.round(selectedObject.duration || 2000)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) handleUpdateSelectedObject('duration', Math.max(500, Math.min(10000, val)));
                        }}
                        className="w-20 bg-[#1a1c20] border border-[#30363d] rounded px-2 py-1 text-right text-xs font-mono text-white focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">ms</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="100"
                    value={Math.round(selectedObject.duration || 2000)}
                    onChange={(e) => handleUpdateSelectedObject('duration', Number(e.target.value))}
                    className="w-full accent-[#a0d8b8] h-1 bg-[#1a1c20] rounded-lg cursor-pointer"
                  />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#30363d]/50 pt-2">
                <span className="text-gray-400">Combo-Set</span>
                <div className="flex gap-1.5">
                  {comboColors.map((col, idx) => (
                    <button
                      key={col}
                      onClick={() => handleUpdateSelectedObject('comboSet', idx)}
                      className={`w-5 h-5 rounded-full border-2 ${selectedObject.comboSet === idx ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => {
                  setHitObjects(prev => prev.filter(o => o.id !== selectedObject.id));
                  setSelectedIds(new Set());
                }}
                className="w-full bg-[#5c242c] hover:bg-[#722e38] text-red-200 py-1.5 rounded text-xs font-semibold mt-2 border border-[#9b3a46]/30 transition-colors"
              >
                Löschen (Del)
              </button>
            </div>
          ) : (
            <div className="text-gray-500 text-xs italic py-4 text-center">
              Kein Objekt ausgewählt.<br/>Klicke ein Objekt mit dem Select-Tool an.
            </div>
          )}
        </div>

        {/* Timing Points Section */}
        <div className="p-4 border-b border-[#30363d] flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-wider mb-1">
            <Clock size={14} />
            <span>Timing-Punkte</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1">
            {version.timingPoints && version.timingPoints.length > 0 ? (
              version.timingPoints.map((tp, idx) => {
                const bpm = Math.round(60000 / tp.beatLength);
                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded border text-xs flex flex-col gap-1 bg-[#1a1c20] border-[#30363d] ${currentTime >= tp.time ? 'border-[#a0d8b8]/40 ring-1 ring-[#a0d8b8]/20' : 'opacity-60'}`}
                  >
                    <div className="flex justify-between font-bold text-gray-200">
                      <span>{tp.uninherited ? 'Uninherited Timing' : 'Inherited (Velocity)'}</span>
                      <span className="font-mono text-[10px] text-gray-400">{formatTime(tp.time)}</span>
                    </div>
                    <div className="flex justify-between font-mono text-[11px] text-gray-400">
                      <span>{tp.uninherited ? `BPM: ${bpm}` : `Multiplier: ${(100 / Math.abs(tp.beatLength)).toFixed(2)}x`}</span>
                      <span>{Math.round(tp.beatLength)} ms</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-xs italic py-4 text-center">
                Keine Timing-Punkte definiert.
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-[#30363d] flex flex-col gap-2 bg-[#1c2024]/40 shrink-0">
          <div className="flex justify-between items-center text-xs text-gray-400 font-mono">
            <span>AR {version.approachRate}</span>
            <span>CS {version.circleSize}</span>
            <span>OD {version.overallDifficulty}</span>
            <span>HP {version.hpDrain}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-[#1a1c20] z-50 flex flex-col font-sans text-gray-200"
      onContextMenu={(e) => e.preventDefault()}
    >
      <TopMenu />
      {renderTimeline()}
      
      {/* Main Area */}
      <div className="flex flex-1 min-h-0 relative">
        <LeftSidebar />

        {/* Playfield Area */}
        <div className="flex-1 bg-[#1a1c20] relative flex items-center justify-center overflow-hidden">
          {activeTab === 'compose' ? (
            <div 
              className="w-full h-full max-w-5xl aspect-[4/3] relative overflow-hidden mx-auto playfield-container cursor-crosshair shadow-2xl border border-white/5"
              onPointerDown={handlePlayfieldPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* BG Image / Video / GameCanvas */}
              {audioBuffer ? (
                <GameCanvas
                  beatmap={editorBeatmap}
                  audioBuffer={audioBuffer}
                  settings={editorSettings}
                  onClose={() => {}}
                  onFinish={() => {}}
                  editorMode={true}
                  editorCurrentTime={currentTime}
                  editorIsPlaying={isPlaying}
                  onEditorTimeUpdate={setCurrentTime}
                  onEditorStop={() => setIsPlaying(false)}
                />
              ) : videoUrl ? (
                <video ref={videoRef} src={videoUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" muted playsInline />
              ) : (
                <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url('${bgUrl || version.bgFilename || 'https://images.unsplash.com/photo-1620059530419-f53e34b95de2?q=80&w=1200&auto=format&fit=crop'}')` }} />
              )}
              {!audioBuffer && audioUrl && <audio ref={audioRef} src={audioUrl} />}
              
              {/* Fallback shadow overlay for background video/image when GameCanvas is not active */}
              {!audioBuffer && <div className="absolute inset-0 bg-[#1a1c20]/40" />}

              
              {/* Grid Overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />

              {/* Render Hit Object Hitboxes for Editing */}
              <div className="absolute inset-0 pointer-events-none">
                {hitObjects.map(obj => {
                  const timeDiff = obj.time - currentTime;
                  const isSelected = selectedIds.has(obj.id);
                  
                  // Approach preemption
                  const approachRate = version.approachRate !== undefined ? version.approachRate : 9;
                  const approachDuration = approachRate < 5 
                    ? 1200 + 600 * (5 - approachRate) / 5 
                    : 1200 - 150 * (approachRate - 5) / 5;

                  // Hide objects that are too old or too far in the future
                  let endTime = obj.time;
                  if (obj.type === 'slider' && obj.sliderLength) {
                     const sliderVelocity = version.sliderMultiplier || 1.4;
                     const tps = version.timingPoints && version.timingPoints.length > 0 ? version.timingPoints.filter(t => t.uninherited) : [];
                     const activeTp = tps.slice().reverse().find(t => t.time <= obj.time) || tps[0];
                     const beatLen = activeTp ? activeTp.beatLength : 500;
                     endTime = obj.time + (obj.sliderLength / (sliderVelocity * 100) * beatLen);
                  }
                  if (obj.type === 'spinner') {
                     endTime = obj.time + (obj.duration || 0);
                  }
                  
                  if (currentTime > endTime + 300 || timeDiff > approachDuration) return null;

                  const cs = version.circleSize !== undefined ? version.circleSize : 4;
                  // Map CS to a diameter in percentage of playfield width
                  const circleDiameterPercent = ((109 - 9 * cs) / 512) * 100;

                  if (obj.type === 'slider') {
                    return (
                      <div key={obj.id} className="absolute inset-0">
                        {/* Start Circle Hitbox */}
                        <div
                          className="absolute aspect-square"
                          style={{
                            left: `${(obj.x / 512) * 100}%`,
                            top: `${(obj.y / 384) * 100}%`,
                            width: `${circleDiameterPercent}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 1000 - Math.floor(timeDiff)
                          }}
                        >
                          <div 
                            className={`w-full h-full rounded-full flex items-center justify-center pointer-events-auto cursor-pointer transition-shadow ${isSelected ? 'ring-4 ring-[#fdb438] bg-black/20' : 'bg-transparent'}`}
                            onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                            onContextMenu={(e) => handleObjectContextMenu(e, obj)}
                          />
                        </div>
                      </div>
                    );
                  } else if (obj.type === 'spinner') {
                    return (
                      <div
                        key={obj.id}
                        className="absolute inset-0 flex items-center justify-center pointer-events-auto"
                      >
                         <div 
                           className={`w-[250px] h-[250px] rounded-full flex items-center justify-center cursor-pointer ${isSelected ? 'ring-4 ring-[#fdb438] bg-black/20' : 'bg-transparent'}`}
                           onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                           onContextMenu={(e) => handleObjectContextMenu(e, obj)}
                         />
                      </div>
                    );
                  }

                  // Default Hit Circle Hitbox
                  return (
                    <div
                      key={obj.id}
                      className="absolute aspect-square"
                      style={{
                        left: `${(obj.x / 512) * 100}%`,
                        top: `${(obj.y / 384) * 100}%`,
                        width: `${circleDiameterPercent}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1000 - Math.floor(timeDiff)
                      }}
                    >
                      <div 
                        className={`w-full h-full rounded-full flex items-center justify-center pointer-events-auto cursor-pointer transition-shadow ${isSelected ? 'ring-4 ring-[#fdb438] bg-black/20' : 'bg-transparent'}`}
                        onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                        onContextMenu={(e) => handleObjectContextMenu(e, obj)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Context Menu Overlay */}
              {contextMenu && (
                <div 
                  className="absolute bg-[#22262b] border border-[#30363d] rounded-md shadow-2xl z-50 py-1.5 w-52 text-xs font-semibold text-gray-200 select-none animate-fade-in"
                  style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1 text-gray-500 text-[10px] uppercase font-bold tracking-wider border-b border-[#30363d] mb-1">
                    Objekt bearbeiten
                  </div>
                  <button 
                    onClick={() => {
                      setHitObjects(prev => prev.map(o => o.id === contextMenu.objectId ? { ...o, type: 'circle' } : o));
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center justify-between transition-colors"
                  >
                    <span>Zu Hit Circle ändern</span>
                    <Circle size={10} className="text-gray-400" />
                  </button>
                  <button 
                    onClick={() => {
                      setHitObjects(prev => prev.map(o => o.id === contextMenu.objectId ? { 
                        ...o, 
                        type: 'slider', 
                        sliderLength: 150, 
                        repeatCount: 1, 
                        sliderPoints: [
                          { x: Math.min(512, o.x + 75), y: Math.min(384, o.y + 20) }, 
                          { x: Math.min(512, o.x + 150), y: o.y }
                        ] 
                      } : o));
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center justify-between transition-colors"
                  >
                    <span>Zu Slider ändern</span>
                    <SlidersHorizontal size={10} className="text-gray-400" />
                  </button>
                  <button 
                    onClick={() => {
                      setHitObjects(prev => prev.map(o => o.id === contextMenu.objectId ? { ...o, type: 'spinner', duration: 2000 } : o));
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center justify-between transition-colors"
                  >
                    <span>Zu Spinner ändern</span>
                    <Palette size={10} className="text-gray-400" />
                  </button>
                  <div className="border-t border-[#30363d] my-1" />
                  <button 
                    onClick={() => {
                      setHitObjects(prev => prev.filter(o => o.id !== contextMenu.objectId));
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.delete(contextMenu.objectId);
                        return next;
                      });
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 text-red-400 flex items-center justify-between transition-colors"
                  >
                    <span>Löschen (Del)</span>
                    <span className="text-[10px] text-red-500/50 font-mono">DEL</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1c20] z-50 flex-col gap-4">
              <CheckCircle2 size={48} className="text-gray-500" />
              <h2 className="text-2xl font-bold text-gray-400">Dieser Bereich ist noch nicht verfügbar.</h2>
            </div>
          )}
        </div>

        <RightSidebar />
      </div>

      {/* Bottom Bar */}
      <div className="h-12 bg-[#22262b] border-t border-[#30363d] flex items-center justify-between z-40 relative">
        <div className="w-[200px] h-full flex flex-col justify-center px-4 shrink-0">
          <div className="text-2xl font-sans text-white leading-none tracking-tight">{formatTime(currentTime)}</div>
          <div className="flex justify-between text-[11px] font-bold text-[#fdb438] mt-0.5">
            <span>{Math.round((currentTime / duration) * 100)}%</span>
            <span>160 BPM</span>
          </div>
        </div>
        <div className="flex-1 flex items-center h-full relative group mx-2 cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setCurrentTime(percent * duration);
        }}>
          {/* Center cursor handled by renderTimeline now, we replace the bottom bar timeline to avoid confusion, or keep it as simple overview. */}
          <div className="absolute left-0 right-4 h-1.5 bg-[#1a1c20] rounded-full overflow-hidden pointer-events-none">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${(currentTime / (version.duration || 1)) * 100}%` }} />
          </div>
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none" 
            style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
          />
          {/* Objects on timeline */}
          <div className="absolute left-0 right-4 h-full pointer-events-none">
            {hitObjects.map(obj => (
              <div 
                key={obj.id} 
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-white/70 rounded-full"
                style={{ left: `${(obj.time / duration) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="w-[320px] flex items-center justify-end h-full pl-4 shrink-0 border-l border-[#30363d]">
          <button 
            className="w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center hover:bg-white/10 transition-colors mr-4"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause size={14} className="fill-current" /> : <Play size={14} className="ml-0.5 fill-current" />}
          </button>
          <div className="flex flex-col text-right mr-4">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Wiedergabegeschwindigkeit</span>
            <div className="flex gap-2.5 text-[11px] font-bold justify-end">
              <span className="text-gray-500 hover:text-white cursor-pointer">25%</span>
              <span className="text-gray-500 hover:text-white cursor-pointer">50%</span>
              <span className="text-gray-500 hover:text-white cursor-pointer">75%</span>
              <span className="text-white cursor-pointer">100%</span>
            </div>
          </div>
          <div className="h-full bg-[#fce07a] px-4 flex items-center justify-between text-black w-24">
            <span className="text-sm font-bold leading-tight uppercase">Test</span>
            <span className="text-[9px] font-bold leading-tight opacity-70 text-right">1.2 ms<br/>120 fps</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, MousePointer2, Circle, RotateCw, Grid,
  Sparkles, Wind, Zap, Waves, LayoutGrid, Ruler,
  Play, Pause, ChevronLeft, ChevronRight,
  Settings, Layers, Clock, CheckCircle2,
  Save, Download, FileAudio, FileImage, Volume2, SlidersHorizontal,
  Palette, MoreVertical, Menu, Move, RotateCcw, Scaling, Check, Search, Type, Activity
} from 'lucide-react';
import { Beatmap, MapGroup, HitObject } from '../types';

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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Accent colors from screenshot
  const comboColors = ['#e63982', '#39e66b', '#ff4dd2'];
  const [activeComboColor, setActiveComboColor] = useState(0);

  const duration = version.duration || 100000;

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let animFrame: number;
    const loop = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      setCurrentTime(prev => {
        let next = prev + delta;
        if (next > duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, duration]);

  const toggleToggle = (id: string) => {
    setActiveToggles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePlayfieldPointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'circle') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(512, ((e.clientX - rect.left) / rect.width) * 512));
      const y = Math.max(0, Math.min(384, ((e.clientY - rect.top) / rect.height) * 384));
      
      const newObj: HitObject = {
        id: Math.random().toString(36).slice(2),
        x,
        y,
        time: currentTime,
        type: 'circle',
        comboIndex: activeComboColor
      };
      setHitObjects(prev => [...prev, newObj].sort((a, b) => a.time - b.time));
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

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging && selectedIds.size > 0 && activeTool === 'select') {
      const rect = e.currentTarget.getBoundingClientRect();
      const ptrX = ((e.clientX - rect.left) / rect.width) * 512;
      const ptrY = ((e.clientY - rect.top) / rect.height) * 384;
      
      setHitObjects(prev => prev.map(obj => {
        if (selectedIds.has(obj.id)) {
          return {
            ...obj,
            x: Math.max(0, Math.min(512, ptrX - dragOffset.x)),
            y: Math.max(0, Math.min(384, ptrY - dragOffset.y))
          };
        }
        return obj;
      }));
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const formatTime = (ms: number) => {
    const totalMs = Math.floor(ms);
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const mls = totalMs % 1000;
    return \`\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}:\${mls.toString().padStart(3, '0')}\`;
  };

  const TopMenu = () => (
    <div className="h-10 bg-[#22262b] flex items-center justify-between px-2 text-sm text-gray-300 select-none border-b border-[#30363d]">
      <div className="flex items-center gap-4">
        <button onClick={onClose} className="flex items-center gap-1.5 font-bold text-white hover:text-[#a0d8b8] transition-colors ml-2">
          <div className="w-6 h-6 bg-[#ff66ab] rounded-full flex items-center justify-center text-white text-[10px]">osu!</div>
          editor
        </button>
        <div className="flex items-center gap-4 ml-4">
          <button className="hover:text-white transition-colors">Datei</button>
          <button className="hover:text-white transition-colors">Bearbeiten</button>
          <button className="hover:text-white transition-colors">Ansicht</button>
          <button className="hover:text-white transition-colors">Timing</button>
        </div>
      </div>
      <div className="flex items-center h-full">
        {['einrichten', 'komponieren', 'design', 'timing', 'überprüfen'].map(tab => {
          const tabStateMap: Record<string, typeof activeTab> = {
            'einrichten': 'setup',
            'komponieren': 'compose',
            'design': 'design',
            'timing': 'timing',
            'überprüfen': 'verify'
          };
          const tabState = tabStateMap[tab];
          const isNotCompose = tabState !== 'compose';
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tabState)}
              disabled={isNotCompose}
              className={\`h-full px-4 flex items-center justify-center font-medium transition-colors border-t-2 \${
                activeTab === tabState
                  ? 'border-[#a0d8b8] bg-[#2a3530] text-[#a0d8b8]' 
                  : isNotCompose
                    ? 'border-transparent text-gray-600 cursor-not-allowed'
                    : 'border-transparent hover:bg-white/5'
              }\`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mr-2">
        <button className="text-[#a0d8b8] hover:text-white font-bold transition-colors">Test</button>
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
            { id: 'select', label: 'Select', icon: MousePointer2 },
            { id: 'circle', label: 'Hit circle', icon: Circle },
            { id: 'slider', label: 'Slider', icon: Activity },
            { id: 'spinner', label: 'Spinner', icon: RotateCw },
            { id: 'grid', label: 'Grid', icon: Grid },
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id as any)}
              className={\`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors \${
                activeTool === tool.id ? 'bg-[#354641] text-[#a0d8b8]' : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
              }\`}
            >
              <tool.icon size={16} className={activeTool === tool.id ? 'text-[#a0d8b8]' : 'text-gray-400'} />
              {tool.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6 mb-2">
          <span className="text-[11px] font-bold text-gray-400">TOGGLES (Q~P)</span>
          <Menu size={14} className="text-gray-400 cursor-pointer" />
        </div>
        <div className="flex flex-col gap-1 relative">
          <div className="flex gap-1 relative">
            <button
              onClick={() => toggleToggle('newCombo')}
              className={\`flex-1 flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors \${
                activeToggles.newCombo ? 'bg-[#354641] text-[#a0d8b8]' : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
              }\`}
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
                    className={\`w-6 h-6 rounded-full border-2 \${activeComboColor === i ? 'border-white' : 'border-transparent'}\`}
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
              className={\`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors \${
                activeToggles[toggle.id] ? 'bg-[#354641] text-[#a0d8b8]' : 'bg-[#2a2f35] text-gray-300 hover:bg-[#32383f]'
              }\`}
            >
              <toggle.icon size={16} className={activeToggles[toggle.id] ? 'text-[#a0d8b8]' : 'text-gray-400'} />
              {toggle.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const RightSidebar = () => (
    <div className="w-[320px] bg-[#22262b] border-l border-[#30363d] flex flex-col select-none overflow-y-auto custom-scrollbar relative z-30">
      <div className="h-48 border-b border-[#30363d] flex items-center justify-center text-gray-500 font-medium text-sm">
        [Object Inspector]
      </div>
      <div className="h-48 border-b border-[#30363d] flex items-center justify-center text-gray-500 font-medium text-sm">
        [Timing Points]
      </div>
      <div className="flex-1" />
      <div className="p-4 border-t border-[#30363d] flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span>AR {version.approachRate}</span>
          <span>CS {version.circleSize}</span>
          <span>OD {version.overallDifficulty}</span>
          <span>HP {version.hpDrain}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1a1c20] z-50 flex flex-col font-sans text-gray-200">
      <TopMenu />
      
      {/* Main Area */}
      <div className="flex flex-1 min-h-0 relative">
        <LeftSidebar />

        {/* Playfield Area */}
        <div className="flex-1 bg-[#1a1c20] relative flex items-center justify-center overflow-hidden">
          {activeTab === 'compose' ? (
            <div 
              className="w-full h-full max-w-5xl aspect-[4/3] relative overflow-hidden mx-auto playfield-container cursor-crosshair"
              onPointerDown={handlePlayfieldPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* BG Image */}
              <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: \`url('\${version.bgFilename || 'https://images.unsplash.com/photo-1620059530419-f53e34b95de2?q=80&w=1200&auto=format&fit=crop'}')\` }} />
              <div className="absolute inset-0 bg-[#1a1c20]/40" />
              
              {/* Grid Overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />

              {/* Render Hit Objects */}
              <div className="absolute inset-0 pointer-events-none">
                {hitObjects.map(obj => {
                  const timeDiff = obj.time - currentTime;
                  if (timeDiff < -300 || timeDiff > 1500) return null;
                  
                  const isSelected = selectedIds.has(obj.id);
                  const color = comboColors[obj.comboIndex % comboColors.length] || comboColors[0];
                  
                  const approachScale = 1 + Math.max(0, timeDiff / 1500) * 2;
                  const opacity = timeDiff > 0 ? Math.min(1, 1 - (timeDiff - 1000) / 500) : Math.max(0, 1 + timeDiff / 300);
                  
                  return (
                    <div
                      key={obj.id}
                      className="absolute"
                      style={{
                        left: \`\${(obj.x / 512) * 100}%\`,
                        top: \`\${(obj.y / 384) * 100}%\`,
                        transform: 'translate(-50%, -50%)',
                        opacity: opacity,
                        zIndex: 1000 - Math.floor(timeDiff)
                      }}
                    >
                      <div 
                        className={\`w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px] rounded-full border-[5px] flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm pointer-events-auto cursor-pointer \${isSelected ? 'ring-4 ring-[#fdb438]' : ''}\`}
                        style={{ borderColor: color }}
                        onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                      >
                        <span className="text-3xl sm:text-4xl md:text-[56px] font-bold text-white leading-none">{obj.comboIndex + 1}</span>
                        {timeDiff > 0 && (
                          <div 
                            className="absolute inset-[-20px] rounded-full border-[5px]"
                            style={{ borderColor: \`\${color}99\`, transform: \`scale(\${approachScale})\` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
          <div className="absolute left-0 right-4 h-1.5 bg-[#1a1c20] rounded-full overflow-hidden pointer-events-none">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: \`\${(currentTime / duration) * 100}%\` }} />
          </div>
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none" 
            style={{ left: \`calc(\${(currentTime / duration) * 100}% - 8px)\` }}
          />
          {/* Objects on timeline */}
          <div className="absolute left-0 right-4 h-full pointer-events-none">
            {hitObjects.map(obj => (
              <div 
                key={obj.id} 
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-white/70 rounded-full"
                style={{ left: \`\${(obj.time / duration) * 100}%\` }}
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
`

fs.writeFileSync('src/components/BeatmapEditor.tsx', code);

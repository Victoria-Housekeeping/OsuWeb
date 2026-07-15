import re

with open('src/components/BeatmapEditor.tsx', 'r') as f:
    content = f.read()

# 1. Replace TopMenu
# The start is "const TopMenu = () => ("
# The end is "  const LeftSidebar = () => ("
top_menu_replacement = """const TopMenu = () => (
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
"""
content = re.sub(r"const TopMenu = \(\) => \([\s\S]*?  const LeftSidebar = \(\) => \(", top_menu_replacement + "\n  const LeftSidebar = () => (", content)

# 2. Timeline navigation
timeline_replacement = """const renderTimeline = () => {
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
  };"""
content = re.sub(r"const renderTimeline = \(\) => \{[\s\S]*?    \);\n  \};", timeline_replacement, content)

# 3. Audio/Video Tags and keyboard events
audio_video_replacement = """const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  
  // Animation loop for playback
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();
    
    const loop = (now: number) => {
      if (isPlaying) {
        const dt = now - lastTime;
        setCurrentTime(prev => {
          let nextTime = prev + dt;
          const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : version.duration;
          if (nextTime > maxDur) {
            setIsPlaying(false);
            if (audioRef.current) audioRef.current.pause();
            if (videoRef.current) videoRef.current.pause();
            return maxDur;
          }
          return nextTime;
        });
      }
      lastTime = now;
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, version.duration]);

  // Sync media with isPlaying state
  useEffect(() => {
    if (isPlaying) {
      if (audioRef.current) {
         audioRef.current.currentTime = currentTime / 1000;
         audioRef.current.play().catch(() => setIsPlaying(false));
      }
      if (videoRef.current) {
         videoRef.current.currentTime = currentTime / 1000;
         videoRef.current.play().catch(() => {});
      }
    } else {
      if (audioRef.current) audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
    }
  }, [isPlaying]);

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        // Snap movement
        const tps = version.timingPoints && version.timingPoints.length > 0 ? version.timingPoints.filter(t => t.uninherited) : [];
        const activeTp = tps.slice().reverse().find(t => t.time <= currentTime) || tps[0];
        if (activeTp) {
          const beatLen = activeTp.beatLength;
          let snapStep = beatLen / 4; // 1/16 note by default (blue line)
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
          
          setCurrentTime(Math.max(0, newTime));
          if (audioRef.current) audioRef.current.currentTime = newTime / 1000;
          if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
        }
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const sorted = [...hitObjects].sort((a,b) => a.time - b.time);
        if (e.code === 'ArrowUp') { // forward
          const next = sorted.find(h => h.time > currentTime + 5);
          if (next) {
             setCurrentTime(next.time);
             if (audioRef.current) audioRef.current.currentTime = next.time / 1000;
             if (videoRef.current) videoRef.current.currentTime = next.time / 1000;
          }
        } else { // backward
          const prev = sorted.slice().reverse().find(h => h.time < currentTime - 5);
          if (prev) {
             setCurrentTime(prev.time);
             if (audioRef.current) audioRef.current.currentTime = prev.time / 1000;
             if (videoRef.current) videoRef.current.currentTime = prev.time / 1000;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, hitObjects, version.timingPoints]);
"""
content = re.sub(r"const audioRef = React\.useRef<HTMLAudioElement \| null>\(null\);\n  const videoRef = React\.useRef<HTMLVideoElement \| null>\(null\);[\s\S]*?const handleWheel = ", audio_video_replacement + "\n  const handleWheel = ", content)

# 4. Inject <audio> and <video> tags
playfield_replacement = """{/* BG Image / Video */}
              {videoUrl ? (
                <video ref={videoRef} src={videoUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" muted playsInline />
              ) : (
                <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url('${bgUrl || version.bgFilename || 'https://images.unsplash.com/photo-1620059530419-f53e34b95de2?q=80&w=1200&auto=format&fit=crop'}')` }} />
              )}
              {audioUrl && <audio ref={audioRef} src={audioUrl} />}
              <div className="absolute inset-0 bg-[#1a1c20]/40" />
"""
content = re.sub(r"\{\/\* BG Image \*\/\}.*?<div className=\"absolute inset-0 bg-\[#1a1c20\]\/40\" \/>", playfield_replacement, content, flags=re.DOTALL)


# 5. Hit Objects replacement
hit_objects_replacement = """{/* Render Hit Objects */}
              <div className="absolute inset-0 pointer-events-none">
                {hitObjects.map(obj => {
                  const timeDiff = obj.time - currentTime;
                  const isSelected = selectedIds.has(obj.id);
                  const color = comboColors[obj.comboSet % comboColors.length] || comboColors[0];
                  
                  // For objects not active yet but approaching
                  const opacity = timeDiff > 0 ? Math.min(1, 1 - (timeDiff - 1000) / 500) : 1;
                  const approachScale = 1 + Math.max(0, timeDiff / 1500) * 2;
                  
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
                  
                  if (currentTime > endTime + 300 || timeDiff > 1500) return null;

                  if (obj.type === 'slider') {
                    // Slider rendering
                    const pts = obj.sliderPoints || [];
                    const dString = pts.length > 0 ? `M ${obj.x} ${obj.y} ` + pts.map(p => `L ${p.x} ${p.y}`).join(' ') : '';
                    
                    return (
                      <div key={obj.id} className="absolute inset-0" style={{ opacity }}>
                        <svg viewBox="0 0 512 384" className="w-full h-full absolute inset-0 drop-shadow-xl overflow-visible" preserveAspectRatio="none">
                          <path d={dString} fill="none" stroke={`${color}66`} strokeWidth="50" strokeLinecap="round" strokeLinejoin="round" />
                          <path d={dString} fill="none" stroke={color} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
                          <path d={dString} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        
                        {/* Start Circle */}
                        <div
                          className="absolute"
                          style={{
                            left: `${(obj.x / 512) * 100}%`,
                            top: `${(obj.y / 384) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 1000 - Math.floor(timeDiff)
                          }}
                        >
                          <div 
                            className={`w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px] rounded-full border-[5px] flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm pointer-events-auto cursor-pointer ${isSelected ? 'ring-4 ring-[#fdb438]' : ''}`}
                            style={{ borderColor: color }}
                            onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                          >
                            <span className="text-3xl font-bold text-white leading-none">{obj.comboIndex + 1}</span>
                            {timeDiff > 0 && (
                              <div 
                                className="absolute inset-[-20px] rounded-full border-[5px]"
                                style={{ borderColor: `${color}99`, transform: `scale(${approachScale})` }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  } else if (obj.type === 'spinner') {
                    // Spinner rendering
                    return (
                      <div
                        key={obj.id}
                        className="absolute inset-0 flex items-center justify-center pointer-events-auto"
                        style={{ opacity: timeDiff > 0 ? opacity : (currentTime <= endTime ? 1 : Math.max(0, 1 - (currentTime - endTime)/300)) }}
                      >
                         <div 
                           className={`w-[300px] h-[300px] rounded-full border-[10px] border-white/20 flex items-center justify-center bg-black/20 cursor-pointer ${isSelected ? 'ring-4 ring-[#fdb438]' : ''}`}
                           onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                         >
                           <div className="w-[50px] h-[50px] rounded-full border-[4px] border-white/50" />
                         </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={obj.id}
                      className="absolute"
                      style={{
                        left: `${(obj.x / 512) * 100}%`,
                        top: `${(obj.y / 384) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        opacity: timeDiff > 0 ? opacity : Math.max(0, 1 + timeDiff / 300),
                        zIndex: 1000 - Math.floor(timeDiff)
                      }}
                    >
                      <div 
                        className={`w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px] rounded-full border-[5px] flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm pointer-events-auto cursor-pointer ${isSelected ? 'ring-4 ring-[#fdb438]' : ''}`}
                        style={{ borderColor: color }}
                        onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                      >
                        <span className="text-3xl sm:text-4xl md:text-[56px] font-bold text-white leading-none">{obj.comboIndex + 1}</span>
                        {timeDiff > 0 && (
                          <div 
                            className="absolute inset-[-20px] rounded-full border-[5px]"
                            style={{ borderColor: `${color}99`, transform: `scale(${approachScale})` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>"""

content = re.sub(r"\{\/\* Render Hit Objects \*\/\}.*?<\/div>\n            <\/div>", hit_objects_replacement + "\n            </div>", content, flags=re.DOTALL)


# Fix the bottom bar timeline so it renders correctly instead of using old style
bottom_timeline_replacement = """{/* Center cursor handled by renderTimeline now, we replace the bottom bar timeline to avoid confusion, or keep it as simple overview. */}
          <div className="absolute left-0 right-4 h-1.5 bg-[#1a1c20] rounded-full overflow-hidden pointer-events-none">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${(currentTime / (version.duration || 1)) * 100}%` }} />
          </div>"""
content = re.sub(r"<div className=\"absolute left-0 right-4 h-1\.5 bg-\[#1a1c20\] rounded-full overflow-hidden pointer-events-none\">\n            <div className=\"h-full bg-gradient-to-r from-blue-500 to-purple-500\".*?<\/div>", bottom_timeline_replacement, content, flags=re.DOTALL)


with open('src/components/BeatmapEditor.tsx', 'w') as f:
    f.write(content)

const fs = require('fs');

const editorPath = 'src/components/BeatmapEditor.tsx';
let code = fs.readFileSync(editorPath, 'utf8');

// We will inject the media refs and loading
const mediaStateCode = `
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadMedia = async () => {
      if (!group.fileName) return;
      const { getOszFile } = await import('../utils/db');
      const { extractFileFromOsz } = await import('../utils/osuParser');
      const oszBlob = await getOszFile(group.fileName);
      if (!oszBlob) return;

      if (version.audioFilename) {
        const audioBlob = await extractFileFromOsz(oszBlob, version.audioFilename);
        if (audioBlob && active) setAudioUrl(URL.createObjectURL(audioBlob));
      }
      if (version.bgFilename) {
        const bgBlob = await extractFileFromOsz(oszBlob, version.bgFilename);
        if (bgBlob && active) setBgUrl(URL.createObjectURL(bgBlob));
      }
      if (version.videoFilename) {
        const videoBlob = await extractFileFromOsz(oszBlob, version.videoFilename);
        if (videoBlob && active) setVideoUrl(URL.createObjectURL(videoBlob));
      }
    };
    loadMedia();
    return () => { active = false; };
  }, [group, version]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(e => console.error(e));
      if (videoRef.current) videoRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
      if (videoRef.current) videoRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    let animFrame: number;
    const loop = () => {
      if (audioRef.current && isPlaying) {
        setCurrentTime(audioRef.current.currentTime * 1000);
      }
      animFrame = requestAnimationFrame(loop);
    };
    if (isPlaying) animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying]);

  const currentSnapDivisor = 4;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === ' ') {
         e.preventDefault();
         setIsPlaying(p => !p);
         return;
      }
      
      if (!isPlaying && version.timingPoints) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const tps = version.timingPoints.filter(t => t.uninherited);
          const tp = tps.slice().reverse().find(t => t.time <= currentTime) || tps[0];
          if (!tp) return;
          
          const beatLength = tp.beatLength;
          let jumpMs = beatLength / currentSnapDivisor;
          if (e.ctrlKey) {
            jumpMs = beatLength;
          }
          
          let newTime = currentTime;
          if (e.key === 'ArrowRight') {
             const offsetTime = currentTime - tp.time;
             newTime = tp.time + Math.floor((offsetTime + 2) / jumpMs + 1) * jumpMs;
          } else {
             const offsetTime = currentTime - tp.time;
             newTime = tp.time + Math.ceil((offsetTime - 2) / jumpMs - 1) * jumpMs;
          }
          
          const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : version.duration;
          newTime = Math.max(0, Math.min(newTime, maxDur));
          setCurrentTime(newTime);
          if (audioRef.current) audioRef.current.currentTime = newTime / 1000;
          if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
        }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (e.key === 'ArrowUp') {
             const nextObj = hitObjects.find(o => o.time > currentTime + 2);
             if (nextObj) {
                setCurrentTime(nextObj.time);
                if (audioRef.current) audioRef.current.currentTime = nextObj.time / 1000;
                if (videoRef.current) videoRef.current.currentTime = nextObj.time / 1000;
             }
          } else {
             const prevObj = hitObjects.slice().reverse().find(o => o.time < currentTime - 2);
             if (prevObj) {
                setCurrentTime(prevObj.time);
                if (audioRef.current) audioRef.current.currentTime = prevObj.time / 1000;
                if (videoRef.current) videoRef.current.currentTime = prevObj.time / 1000;
             }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, isPlaying, version.timingPoints, hitObjects, version.duration]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!isPlaying) {
       const delta = e.deltaY > 0 ? 100 : -100;
       const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : version.duration;
       const newTime = Math.max(0, Math.min(currentTime + delta, maxDur));
       setCurrentTime(newTime);
       if (audioRef.current) audioRef.current.currentTime = newTime / 1000;
       if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
    }
  };
`;

code = code.replace(
  `  const [showComboColors, setShowComboColors] = useState<boolean>(false);`,
  `  const [showComboColors, setShowComboColors] = useState<boolean>(false);
${mediaStateCode}`
);


// Rewrite the visual rendering
const objectRendering = `
          <div className="absolute inset-0 pointer-events-none">
            {hitObjects.map(obj => {
              const timeDiff = obj.time - currentTime;
              if (timeDiff < -800 || timeDiff > 1500) return null;
              
              const isSelected = selectedIds.has(obj.id);
              const color = comboColors[obj.comboSet % comboColors.length] || comboColors[0];
              
              const approachScale = 1 + Math.max(0, timeDiff / 1500) * 2;
              const opacity = timeDiff > 0 ? Math.min(1, 1 - (timeDiff - 1000) / 500) : Math.max(0, 1 + timeDiff / 300);
              
              const leftPerc = (obj.x / 512) * 100;
              const topPerc = (obj.y / 384) * 100;
              const zIndex = 1000 - Math.floor(timeDiff);
              
              const csMult = (512 / 640); 
              // A rough approximation of osu! pixel circle size to SVG width
              const hitRadius = (54.4 - 4.48 * version.circleSize) * 1.5;

              if (obj.type === 'slider' && obj.sliderPoints && obj.sliderPoints.length > 0) {
                return (
                  <React.Fragment key={obj.id}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 512 384" preserveAspectRatio="none" style={{ opacity, zIndex: zIndex - 1 }}>
                      <polyline 
                        points={obj.sliderPoints.map(p => \`\${p.x},\${p.y}\`).join(' ')}
                        fill="none"
                        stroke="#222"
                        strokeWidth={hitRadius * 1.8 + 4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline 
                        points={obj.sliderPoints.map(p => \`\${p.x},\${p.y}\`).join(' ')}
                        fill="none"
                        stroke={color}
                        strokeWidth={hitRadius * 1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline 
                        points={obj.sliderPoints.map(p => \`\${p.x},\${p.y}\`).join(' ')}
                        fill="none"
                        stroke="#111"
                        strokeWidth={hitRadius * 1.8 - 4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="absolute" style={{ left: \`\${leftPerc}%\`, top: \`\${topPerc}%\`, transform: 'translate(-50%, -50%)', opacity, zIndex }}>
                      <div 
                        className={\`rounded-full border-[3px] flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm pointer-events-auto cursor-pointer \${isSelected ? 'ring-4 ring-[#fdb438]' : ''}\`}
                        style={{ borderColor: color, width: hitRadius * 2, height: hitRadius * 2 }}
                        onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                      >
                        <span className="font-bold text-white leading-none" style={{ fontSize: hitRadius }}>{obj.comboIndex + 1}</span>
                        {timeDiff > 0 && (
                          <div 
                            className="absolute inset-[-10px] rounded-full border-[3px]"
                            style={{ borderColor: \`\${color}99\`, transform: \`scale(\${approachScale})\` }}
                          />
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              if (obj.type === 'spinner') {
                return (
                  <div key={obj.id} className="absolute pointer-events-auto" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', opacity, zIndex }}>
                    <div className={\`w-[300px] h-[300px] rounded-full border-[8px] flex items-center justify-center bg-blue-500/10 cursor-pointer \${isSelected ? 'ring-4 ring-[#fdb438]' : ''}\`} style={{ borderColor: color }} onPointerDown={(e) => handleObjectPointerDown(e, obj)}>
                      <div className="w-[50px] h-[50px] rounded-full" style={{ backgroundColor: color }} />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={obj.id}
                  className="absolute"
                  style={{
                    left: \`\${leftPerc}%\`,
                    top: \`\${topPerc}%\`,
                    transform: 'translate(-50%, -50%)',
                    opacity: opacity,
                    zIndex: zIndex
                  }}
                >
                  <div 
                    className={\`rounded-full border-[3px] flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm pointer-events-auto cursor-pointer \${isSelected ? 'ring-4 ring-[#fdb438]' : ''}\`}
                    style={{ borderColor: color, width: hitRadius * 2, height: hitRadius * 2 }}
                    onPointerDown={(e) => handleObjectPointerDown(e, obj)}
                  >
                    <span className="font-bold text-white leading-none" style={{ fontSize: hitRadius }}>{obj.comboIndex + 1}</span>
                    {timeDiff > 0 && (
                      <div 
                        className="absolute inset-[-10px] rounded-full border-[3px]"
                        style={{ borderColor: \`\${color}99\`, transform: \`scale(\${approachScale})\` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
`;

code = code.replace(/<div className="absolute inset-0 pointer-events-none">[\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<div className="h-[200px]/, objectRendering + `\n          </div>\n        </div>\n        <div className="h-[200px]`);

// Inject Taktleiste HTML and Video/Audio tags
const backgroundMedia = `
        {/* Background Media */}
        <div className="absolute inset-0 bg-black -z-10 overflow-hidden">
           {videoUrl ? (
             <video ref={videoRef} src={videoUrl} className="w-full h-full object-cover opacity-30" muted playsInline />
           ) : bgUrl ? (
             <img src={bgUrl} className="w-full h-full object-cover opacity-30" />
           ) : null}
           {audioUrl && <audio ref={audioRef} src={audioUrl} />}
        </div>
`;

code = code.replace(/<div className="absolute inset-0 bg-black\/90 -z-10" \/>/, backgroundMedia);

// Dropdown state
const dropdownState = `
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  
  const renderTimeline = () => {
    const viewWidthMs = 4000;
    const halfWidth = viewWidthMs / 2;
    const startTime = currentTime - halfWidth;
    const endTime = currentTime + halfWidth;

    const tps = version.timingPoints ? version.timingPoints.filter(t => t.uninherited) : [];
    const activeTp = tps.slice().reverse().find(t => t.time <= endTime) || tps[0];
    
    let ticks: {time: number; color: string; height: number}[] = [];
    if (activeTp) {
      const beatLen = activeTp.beatLength;
      const firstBeat = Math.floor((startTime - activeTp.time) / beatLen);
      const lastBeat = Math.ceil((endTime - activeTp.time) / beatLen);

      for (let b = firstBeat; b <= lastBeat; b++) {
        const beatTime = activeTp.time + b * beatLen;
        ticks.push({ time: beatTime, color: 'white', height: 24 });
        ticks.push({ time: beatTime + beatLen * 0.5, color: '#ff4d4d', height: 16 });
        ticks.push({ time: beatTime + beatLen * 0.25, color: '#4d79ff', height: 12 });
        ticks.push({ time: beatTime + beatLen * 0.75, color: '#4d79ff', height: 12 });
      }
    }

    return (
      <div className="flex-1 h-full bg-[#1a1c20] relative overflow-hidden" onWheel={handleWheel}>
        {/* Timeline cursor in middle */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white z-20 -translate-x-1/2" />
        
        {/* Ticks */}
        {ticks.map((t, i) => {
          if (t.time < startTime || t.time > endTime) return null;
          const leftPerc = ((t.time - startTime) / viewWidthMs) * 100;
          return (
             <div 
               key={i}
               className="absolute top-1/2 -translate-y-1/2 w-[2px]"
               style={{ left: \`\${leftPerc}%\`, height: t.height, backgroundColor: t.color }}
             />
          );
        })}
        
        {/* HitObjects on timeline */}
        {hitObjects.map(obj => {
           if (obj.time < startTime || obj.time > endTime) return null;
           const leftPerc = ((obj.time - startTime) / viewWidthMs) * 100;
           const color = comboColors[obj.comboSet % comboColors.length] || comboColors[0];
           
           if (obj.type === 'slider' && obj.endTime) {
              const rightPerc = ((obj.endTime - startTime) / viewWidthMs) * 100;
              return (
                <div key={obj.id} className="absolute top-1/2 -translate-y-1/2 h-8 rounded-full border opacity-80"
                     style={{ left: \`\${leftPerc}%\`, width: \`\${Math.max(4, rightPerc - leftPerc)}%\`, borderColor: color, backgroundColor: \`\${color}40\` }} />
              );
           }
           
           return (
             <div key={obj.id} className="absolute top-1/2 -translate-y-1/2 w-2 h-8 rounded-full border bg-black/50"
                  style={{ left: \`calc(\${leftPerc}% - 4px)\`, borderColor: color }} />
           );
        })}
      </div>
    );
  };
`;

code = code.replace(
  `  return (`,
  dropdownState + `\n  return (`
);

const topMenuHtml = `
      <div className="h-12 bg-[#22242a] flex items-center px-4 justify-between border-b border-[#30363d] shrink-0">
        <div className="flex items-center h-full relative">
          {/* Menu Items */}
          {['Datei', 'Bearbeiten', 'Ansicht', 'Timing', 'Web'].map((menu) => (
             <div key={menu} className="relative h-full">
               <button 
                 className={\`px-3 h-full text-[13px] font-medium transition-colors \${openMenu === menu ? 'bg-[#30363d] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'}\`}
                 onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
               >
                 {menu}
               </button>
               {openMenu === menu && (
                 <div className="absolute top-full left-0 bg-[#30363d] border border-[#444] rounded-sm py-1 min-w-[200px] z-50 shadow-xl" onClick={() => setOpenMenu(null)}>
                   {menu === 'Datei' && (
                     <>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Speichern</span><span className="text-white/50">CTRL-S</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Ungespeicherte Änderungen verwerfen</span><span className="text-white/50">CTRL-L</span></div>
                        <div className="h-[1px] bg-[#444] my-1" />
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Exportieren</span><span className="text-white/50">&gt;</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Extern bearbeiten</span><span className="text-white/50">CTRL-SHIFT-O</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Beatmap hochladen</span><span className="text-white/50">CTRL-SHIFT-U</span></div>
                        <div className="h-[1px] bg-[#444] my-1" />
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer">Beatmap-Informationsseite öffnen</div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer">Beatmap-Diskussionsseite öffnen</div>
                        <div className="h-[1px] bg-[#444] my-1" />
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer" onClick={onClose}>Beenden</div>
                     </>
                   )}
                   {menu === 'Bearbeiten' && (
                     <>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Rückgängig machen</span><span className="text-white/50">CTRL-Z</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Wiederherstellen</span><span className="text-white/50">CTRL-Y</span></div>
                        <div className="h-[1px] bg-[#444] my-1" />
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Ausschneiden</span><span className="text-white/50">CTRL-X</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Kopieren</span><span className="text-white/50">CTRL-C</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Einfügen</span><span className="text-white/50">CTRL-V</span></div>
                        <div className="px-4 py-1.5 text-[12px] text-white hover:bg-[#4d79ff] cursor-pointer flex justify-between"><span>Klonen</span><span className="text-white/50">CTRL-D</span></div>
                     </>
                   )}
                   {['Ansicht', 'Timing', 'Web'].includes(menu) && (
                     <div className="px-4 py-1.5 text-[12px] text-gray-400">Nicht implementiert</div>
                   )}
                 </div>
               )}
             </div>
          ))}
          <div className="w-px h-6 bg-[#444] mx-2" />
          <div className="flex h-full w-[400px]">
             {renderTimeline()}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[13px] font-bold text-white">{version.version}</div>
            <div className="text-[11px] text-gray-400">{group.title}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
`;

code = code.replace(
  /<div className="h-14 bg-\[#1a1c20\] flex items-center px-4 justify-between shrink-0">[\s\S]*?<\/div>\n\s*<div className="flex flex-1 overflow-hidden">/,
  topMenuHtml + '\n      <div className="flex flex-1 overflow-hidden">'
);

fs.writeFileSync('src/components/BeatmapEditor.tsx', code);

import React, { useRef, useState, useEffect } from 'react';
import { Beatmap, GameSettings, PlayStats, MapGroup } from '../types';
import { parseOszFile } from '../utils/osuParser';
import { generateAudioBufferForBeatmap } from '../utils/audioSynth';
import { saveOszFile, getAllOszFiles, deleteOszFile } from '../utils/db';
import { Upload, Music, Settings, Play, Info, Check, EyeOff, Sliders, Volume2, VolumeX, Trophy, HelpCircle, X, Trash2, Search, Tv } from 'lucide-react';
import { getReplaysForBeatmap, deleteReplay, saveReplay } from '../utils/replays';

interface BeatmapSelectorProps {
  onSelect: (beatmap: Beatmap, audioBuffer: AudioBuffer) => void;
  onSelectReplay: (beatmap: Beatmap, audioBuffer: AudioBuffer, playerName: string) => void;
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
  mapGroups: MapGroup[];
  setMapGroups: React.Dispatch<React.SetStateAction<MapGroup[]>>;
  selectedGroupIdx: number;
  setSelectedGroupIdx: React.Dispatch<React.SetStateAction<number>>;
  selectedVersionIdx: number;
  setSelectedVersionIdx: React.Dispatch<React.SetStateAction<number>>;
}

export const BeatmapSelector: React.FC<BeatmapSelectorProps> = ({
  onSelect,
  onSelectReplay,
  settings,
  onUpdateSettings,
  mapGroups,
  setMapGroups,
  selectedGroupIdx,
  setSelectedGroupIdx,
  selectedVersionIdx,
  setSelectedVersionIdx,
}) => {
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [deletedTrigger, setDeletedTrigger] = useState<number>(0);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [activeReplayModalGroup, setActiveReplayModalGroup] = useState<MapGroup | null>(null);
  const [highScores, setHighScores] = useState<Record<string, { score: number; maxCombo: number; accuracy: number }>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const playReplay = async (ver: Beatmap, playerName: string) => {
    setActiveReplayModalGroup(null);
    setIsLoading(true);
    setLoadingStep('Lese Replay-Audiospur...');

    try {
      let audioBuffer: AudioBuffer;

      if (ver.id === 'built-in-synthwave-tutorial') {
        audioBuffer = await generateAudioBufferForBeatmap();
      } else if (ver.audioBlob) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await ver.audioBlob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        ctx.close();
      } else {
        throw new Error('Keine Audio-Datei für diese Beatmap gefunden.');
      }

      onSelectReplay(ver, audioBuffer, playerName);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Synthesizer / Audio-Decoder konnte nicht initialisiert werden.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load stored IndexedDB beatmaps once
  useEffect(() => {
    const loadAllMaps = async () => {
      if (mapGroups.length > 0) return; // Already loaded!

      try {
        const dbFiles = await getAllOszFiles();
        const loadedGroups: MapGroup[] = [];

        for (const fileItem of dbFiles) {
          try {
            const file = new File([fileItem.blob], fileItem.name, { type: fileItem.blob.type });
            const parsedMaps = await parseOszFile(file);
            
            const songTitle = parsedMaps[0].title;
            const artist = parsedMaps[0].artist;
            const creator = parsedMaps[0].creator;
            const bgUrl = parsedMaps.find(m => m.bgUrl)?.bgUrl;

            const newGroup: MapGroup = {
              title: songTitle,
              artist,
              creator,
              bgUrl,
              versions: parsedMaps,
              fileName: fileItem.name,
            };
            loadedGroups.push(newGroup);
          } catch (e) {
            console.error('Fehler beim Laden der gespeicherten Beatmap:', fileItem.name, e);
          }
        }

        setMapGroups(loadedGroups);
      } catch (err) {
        console.error('Fehler beim Laden der Beatmaps:', err);
      }
    };

    loadAllMaps();
    loadHighScores();
  }, []);

  const loadHighScores = () => {
    const scores: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('osutouch_score_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            scores[key.replace('osutouch_score_', '')] = JSON.parse(raw);
          }
        } catch (e) {}
      }
    }
    setHighScores(scores);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processOszFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processOszFile(file);
    }
  };

  const processOszFile = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);

    const fileName = file.name.toLowerCase();

    // Check if importing a Replay or Skin JSON file
    if (fileName.endsWith('.json')) {
      setLoadingStep('Analysiere Import-Datei (.json)...');
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Check if the JSON is a Skin configuration
        const isSkin = data.skinPreset !== undefined || data.customSkinColors !== undefined || data.hitcircleFill !== undefined;
        if (isSkin) {
          const skinColors = data.customSkinColors || {
            hitcircleFill: data.hitcircleFill || '#3b82f6',
            hitcircleBorder: data.hitcircleBorder || '#ffffff',
            approachCircleColor: data.approachCircleColor || '#60a5fa',
            textColor: data.textColor || '#ffffff',
            sliderTrackColor: data.sliderTrackColor || '#2563eb',
          };
          onUpdateSettings({
            ...settings,
            skinPreset: 'custom',
            customSkinColors: skinColors,
          });
          setIsLoading(false);
          setLoadingStep('');
          setErrorMsg(`✓ Skin "${data.name || data.skinName || 'Eigener Skin'}" erfolgreich importiert und aktiviert!`);
          return;
        }

        // Extract metadata with high-grade fallbacks

        const playerName = data.playerName || data.name || data.player || 'Replay Spieler';
        const score = Number(data.score !== undefined ? data.score : 650000);
        const maxCombo = Number(data.maxCombo !== undefined ? data.maxCombo : (data.combo !== undefined ? data.combo : 120));
        const accuracy = Number(data.accuracy !== undefined ? data.accuracy : (data.acc !== undefined ? data.acc : 95.5));
        const dateStr = data.date || new Date().toLocaleDateString('de-DE');

        // Determine destination beatmap ID
        const activeGroup = mapGroups[selectedGroupIdx];
        const activeVersion = activeGroup?.versions[selectedVersionIdx];
        const targetBeatmapId = data.beatmapId || activeVersion?.id || 'built-in-synthwave-tutorial';

        // Save replay!
        saveReplay(targetBeatmapId, {
          beatmapId: targetBeatmapId,
          playerName,
          score,
          maxCombo,
          accuracy,
          date: dateStr,
        });

        setIsLoading(false);
        setLoadingStep('');
        
        // Show custom success notification inside error message box structure
        setErrorMsg(`✓ Replay für "${playerName}" erfolgreich importiert und zugeordnet!`);
        return;
      } catch (err: any) {
        console.error('Replay import failure:', err);
        setErrorMsg('Fehler beim Replay-Import: ' + (err.message || 'Ungültiges Format'));
        setIsLoading(false);
        return;
      }
    }

    const activeGroup = mapGroups[selectedGroupIdx];
    const activeVersion = activeGroup ? activeGroup.versions[selectedVersionIdx] : null;

    // Check if importing a Video file
    if (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mov') || fileName.endsWith('.avi')) {
      if (!activeVersion) {
        setErrorMsg('Bitte wähle zuerst einen Song und eine Schwierigkeit aus, um das Video zuzuordnen!');
        setIsLoading(false);
        return;
      }
      setLoadingStep('Binde Hintergrund-Video an ausgewählten Song...');
      try {
        const videoUrl = URL.createObjectURL(file);
        activeVersion.videoUrl = videoUrl;
        activeVersion.videoBlob = file;
        activeVersion.videoFilename = file.name;

        setErrorMsg(`✓ Video "${file.name}" erfolgreich an "${activeGroup.title} [${activeVersion.version}]" gebunden!`);
        setIsLoading(false);
        setLoadingStep('');
        return;
      } catch (err: any) {
        setErrorMsg('Fehler beim Video-Import: ' + err.message);
        setIsLoading(false);
        return;
      }
    }

    setLoadingStep('Lese Beatmap Archiv (.osz)...');
    if (!fileName.endsWith('.osz') && !fileName.endsWith('.zip')) {
      setErrorMsg(`Ungültige Datei: "${file.name}" ist keine gültige osu! Beatmap-Datei. Bitte wähle eine .osz, .zip, ein Video (.mp4 / .webm) oder eine Replay-Datei.`);
      setIsLoading(false);
      return;
    }

    try {
      const parsedMaps = await parseOszFile(file);
      
      // Group them by song title
      const songTitle = parsedMaps[0].title;
      const artist = parsedMaps[0].artist;
      const creator = parsedMaps[0].creator;
      const bgUrl = parsedMaps.find(m => m.bgUrl)?.bgUrl;

      const newGroup: MapGroup = {
        title: songTitle,
        artist,
        creator,
        bgUrl,
        versions: parsedMaps,
        fileName: file.name,
      };

      // Save to IndexedDB so it survives page reload!
      await saveOszFile(file.name, file);

      setMapGroups(prev => {
        // Prevent duplicate loads of same fileName
        const filtered = prev.filter(g => g.fileName !== file.name);
        return [newGroup, ...filtered];
      });
      setSelectedGroupIdx(0);
      setSelectedVersionIdx(0);
      
      setLoadingStep('');
      setIsLoading(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Die Beatmap-Datei konnte nicht gelesen werden.');
      setIsLoading(false);
    }
  };

  const playBeatmap = async (gIdx: number, vIdx: number) => {
    if (mapGroups.length === 0) return;

    const group = mapGroups[gIdx];
    if (!group) return;
    const ver = group.versions[vIdx];
    if (!ver) return;

    setIsLoading(true);
    setLoadingStep('Bereite Audio-Daten vor...');

    try {
      let audioBuffer: AudioBuffer;

      if (ver.id === 'built-in-synthwave-tutorial') {
        // Synthesize dynamic synth loops in the browser
        audioBuffer = await generateAudioBufferForBeatmap();
      } else if (ver.audioBlob) {
        // Parse raw uploaded MP3 / audio binary
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await ver.audioBlob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        ctx.close();
      } else {
        throw new Error('Keine Audio-Datei für diese Beatmap gefunden.');
      }

      onSelect(ver, audioBuffer);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Synthesizer / Audio-Decoder konnte nicht initialisiert werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const handleDifficultySelect = (gIdx: number, vIdx: number) => {
    setSelectedGroupIdx(gIdx);
    setSelectedVersionIdx(vIdx);

    const group = mapGroups[gIdx];
    const ver = group?.versions[vIdx];
    if (!ver) return;

    const now = Date.now();
    if (
      lastTapRef.current &&
      lastTapRef.current.id === ver.id &&
      now - lastTapRef.current.time < 350
    ) {
      // Double tap detected! Play immediately
      playBeatmap(gIdx, vIdx);
    } else {
      lastTapRef.current = { id: ver.id, time: now };
    }
  };

  const handleStartPlay = async () => {
    playBeatmap(selectedGroupIdx, selectedVersionIdx);
  };

  const toggleSettingBool = (key: keyof GameSettings) => {
    const nextVal = !settings[key];
    const nextSettings = { ...settings, [key]: nextVal };
    
    // When disabling screen clicks, we MUST force keyboard control to true
    if (key === 'disableClicking' && nextVal) {
      nextSettings.useKeyboard = true;
    }
    // Prevent turning off keyboard controls when screen clicking is deactivated
    if (key === 'useKeyboard' && !nextVal && settings.disableClicking) {
      return;
    }

    onUpdateSettings(nextSettings);
  };

  const updateSettingNum = (key: keyof GameSettings, val: number) => {
    onUpdateSettings({
      ...settings,
      [key]: val
    });
  };

  const handleDeleteClick = async (e: React.MouseEvent, idx: number, group: MapGroup) => {
    e.stopPropagation();
    if (!group.fileName) return;

    if (deleteConfirmIdx === idx) {
      try {
        await deleteOszFile(group.fileName);
        
        setMapGroups(prev => prev.filter((_, i) => i !== idx));
        setDeleteConfirmIdx(null);
        
        if (selectedGroupIdx === idx) {
          setSelectedGroupIdx(0);
        } else if (selectedGroupIdx > idx) {
          setSelectedGroupIdx(selectedGroupIdx - 1);
        }
        setSelectedVersionIdx(0);
      } catch (err) {
        console.error('Failed to delete map:', err);
      }
    } else {
      setDeleteConfirmIdx(idx);
    }
  };

  const getStarRating = (v: Beatmap) => {
    const base = (v.circleSize * 0.15) + (v.approachRate * 0.35) + (v.overallDifficulty * 0.3) + (v.hpDrain * 0.2);
    return parseFloat(Math.max(1.0, Math.min(10.0, base)).toFixed(1));
  };

  const getStarColor = (stars: number) => {
    if (stars < 2.0) return 'emerald-400';   // Green (Easy)
    if (stars < 3.2) return 'sky-400';       // Cyan/Blue (Normal)
    if (stars < 4.5) return 'amber-400';     // Yellow (Hard)
    if (stars < 5.8) return 'pink-500';      // Pink (Insane)
    if (stars < 7.2) return 'purple-500';    // Violet (Expert)
    return 'red-500';                         // Red/Crimson (Extra)
  };

  const getStarBgClass = (stars: number) => {
    if (stars < 2.0) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (stars < 3.2) return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    if (stars < 4.5) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (stars < 5.8) return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
    if (stars < 7.2) return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    return 'bg-red-500/10 text-red-400 border-red-500/30';
  };

  const filteredGroups = mapGroups
    .map((g, originalIdx) => ({ g, originalIdx }))
    .filter(({ g }) => {
      const q = searchQuery.toLowerCase();
      return (
        g.title.toLowerCase().includes(q) ||
        g.artist.toLowerCase().includes(q) ||
        (g.creator && g.creator.toLowerCase().includes(q))
      );
    });

  const activeGroup = mapGroups[selectedGroupIdx];
  const activeVersion = activeGroup ? activeGroup.versions[selectedVersionIdx] : null;
  const activeHighScore = activeVersion ? highScores[activeVersion.id] : null;

  return (
    <div className="w-full h-full bg-[#0E0E12] text-gray-100 font-sans flex flex-col overflow-x-hidden overflow-y-auto select-none custom-scrollbar">
      
      {/* Header Bar */}
      <header className="h-16 border-b border-white/[0.06] px-6 flex items-center justify-between bg-[#14141A] sticky top-0 z-20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF3399] via-[#FF66AA] to-[#FF99CC] flex items-center justify-center shadow-[0_0_20px_rgba(255,51,153,0.4)] border border-white/20 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-pulse duration-[3000ms]">
              <span className="text-white font-extrabold italic text-2xl -mt-0.5 select-none transition-transform hover:rotate-12 duration-200">o!</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-widest text-white leading-none">osu!</span>
              <span className="text-[10px] font-bold tracking-widest text-[#FF66AA] uppercase leading-none opacity-90 mt-0.5">lazer-touch</span>
            </div>
          </div>
          <div className="hidden md:flex gap-1 h-8 items-center bg-black/30 border border-white/5 rounded-lg p-0.5 ml-4">
            <button className="px-3 py-1 bg-[#FF66AA]/10 text-[#FF66AA] rounded-md text-[11px] font-extrabold tracking-wider transition-colors">SOLO</button>
            <button className="px-3 py-1 text-gray-400 hover:text-white rounded-md text-[11px] font-extrabold tracking-wider transition-colors">MULtIPLAYER</button>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 max-w-xs md:max-w-sm mx-4">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 cursor-text" />
          <input
            id="search-song-input"
            type="text"
            placeholder="Suche Songs, Artists, Mappers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1B1B22] border border-white/[0.07] rounded-full pl-10 pr-4 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#FF66AA]/50 focus:ring-1 focus:ring-[#FF66AA]/20 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-5">
          <button
            id="btn-open-settings"
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1C1C24] hover:bg-[#252530] active:scale-95 border border-white/10 rounded-xl text-xs font-semibold tracking-wide text-gray-200 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#FF66AA]" />
            <span className="hidden sm:inline">Einstellungen</span>
          </button>
        </div>
      </header>

      {/* Main Grid Selector Section */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-[radial-gradient(circle_at_bottom_right,_#1c1c28_0%,_#0E0E12_70%)]">
        
        {/* Left Side: Beatmap list & Upload */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* File Drag Zone */}
          <div
            id="dropzone-beatmap"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-white/15 hover:border-[#FF66AA]/40 rounded-2xl flex flex-col items-center justify-center p-6 bg-[#16161F]/60 hover:bg-[#16161F]/90 transition-all cursor-pointer group shadow-[0_8px_30px_rgba(0,0,0,0.4)] gap-4"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform border border-white/5">
              <Upload className="w-6 h-6 text-[#FF66AA]" />
            </div>
            <div className="text-center">
              <p className="font-extrabold text-white uppercase tracking-widest text-xs">Importiere eigene Songs, Videos & Replays</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Ziehe deine <span className="text-[#FF66AA] font-bold font-mono text-[11px]">.osz / .zip</span> Songs, <span className="text-[#FF66AA] font-bold font-mono text-[11px]">.mp4 / .webm</span> Hintergrund-Videos oder <span className="text-[#FF66AA] font-bold font-mono text-[11px]">.json</span> Replays hierhin.
              </p>
            </div>
          </div>

          {/* List of Maps */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-bold tracking-widest text-[#FF66AA] uppercase font-mono">SONG AUSWAHL</h2>
              {searchQuery && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {filteredGroups.length} von {mapGroups.length} Treffern
                </span>
              )}
            </div>
                     {filteredGroups.length === 0 ? (
              <div className="p-12 text-center text-gray-500 border border-white/5 bg-[#14141A]/70 rounded-2xl">
                {searchQuery ? 'Keine passenden Songs gefunden.' : 'Keine Beatmaps vorhanden.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 lg:max-h-[72vh] max-h-none overflow-y-auto pr-2 custom-scrollbar">
                {filteredGroups.map(({ g: group, originalIdx }) => {
                  const isSelected = originalIdx === selectedGroupIdx;
                  const currentSelectedVersion = group.versions[selectedVersionIdx] || group.versions[0];
                  const currentHighScore = currentSelectedVersion ? highScores[currentSelectedVersion.id] : null;

                  return (
                    <div
                      key={`${group.title}-${originalIdx}`}
                      id={`map-group-${originalIdx}`}
                      onClick={() => {
                        if (!isSelected) {
                          setSelectedGroupIdx(originalIdx);
                          setSelectedVersionIdx(0);
                        }
                      }}
                      className={`p-4 rounded-xl border flex flex-col justify-between text-left transition-all relative overflow-hidden group min-h-[92px] cursor-pointer ${
                        isSelected
                          ? 'border-[#FF66AA] bg-[#1E1E28] shadow-[0_0_25px_rgba(255,102,170,0.18)] border-l-4 border-l-[#FF66AA]'
                          : 'border-white/[0.04] bg-[#14141A]/85 hover:bg-[#1C1C24] hover:border-white/10'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        {/* Blurred backdrop image matching osu!lazer song select */}
                        {group.bgUrl && (
                          <div 
                            className="absolute inset-y-0 right-0 w-1/2 bg-cover bg-center pointer-events-none opacity-20 group-hover:opacity-35 transition-opacity" 
                            style={{ 
                              backgroundImage: `url(${group.bgUrl})`,
                              maskImage: 'linear-gradient(to right, transparent, rgba(0,0,0,0.9))',
                              WebkitMaskImage: 'linear-gradient(to right, transparent, rgba(0,0,0,0.9))'
                            }}
                          />
                        )}

                        <div className="flex items-center gap-4 relative z-10">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-[#FF66AA]/25 text-[#FF66AA] scale-105'
                              : 'bg-white/5 text-gray-400 group-hover:text-white'
                          }`}>
                            <Music className="w-5 h-5 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-white tracking-tight text-sm line-clamp-1 group-hover:text-[#FF66AA] transition-colors">{group.title}</h3>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 font-semibold">{group.artist}</p>
                            
                            {/* osu!lazer difficulty mini colored dots for immediate selection feedback */}
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {group.versions.slice(0, 10).map((v) => {
                                const rating = getStarRating(v);
                                const dotColor = getStarColor(rating);
                                return (
                                  <span 
                                    key={v.id} 
                                    className={`w-2.5 h-2.5 rounded-full inline-block border border-black/45 shadow-[0_0_5px_rgba(0,0,0,0.4)]`} 
                                    style={{ backgroundColor: dotColor }}
                                    title={`${v.version} - ★ ${rating}`}
                                  />
                                );
                              })}
                              {group.versions.length > 10 && (
                                <span className="text-[9px] text-gray-500 font-black self-center leading-none pl-0.5">+{group.versions.length - 10}</span>
                              )}
                            </div>

                          </div>
                        </div>

                        <div className="text-right flex items-center gap-2 relative z-10" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-[10px] px-2.5 py-1 border rounded-full font-mono font-extrabold tracking-wide ${
                            isSelected
                              ? 'bg-[#FF66AA]/10 text-[#FF66AA] border-[#FF66AA]/30'
                              : 'bg-white/5 text-gray-400 border-white/10'
                          }`}>
                            {group.versions.length} DIFFS
                          </span>

                          {/* REPLAY BUTTON */}
                          {group.versions.some(v => getReplaysForBeatmap(v.id).length > 0) && (
                            <button
                              id={`btn-replays-${originalIdx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReplayModalGroup(group);
                              }}
                              className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-[#FF66AA]/25 hover:border-[#FF66AA]/30 hover:text-[#FF66AA] text-gray-300 transition-all flex items-center justify-center min-w-[28px] cursor-pointer"
                              title="Replays anzeigen"
                            >
                              <Tv className="w-3.5 h-3.5" />
                            </button>
                          )}
                          
                          {group.fileName && (
                            <span
                              role="button"
                              onClick={(e) => handleDeleteClick(e, originalIdx, group)}
                              className={`p-1.5 rounded-lg border transition-all flex items-center justify-center min-w-[28px] ${
                                deleteConfirmIdx === originalIdx
                                  ? 'bg-red-500/20 border-red-500 text-red-400 font-bold text-[10px] uppercase'
                                  : 'bg-white/5 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 border-white/10 text-gray-405'
                              }`}
                              title="Song löschen"
                            >
                              {deleteConfirmIdx === originalIdx ? (
                                'Ja'
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Compact inline details for mobile / Portrait layout */}
                      {isSelected && (
                        <div 
                          className="mt-4 pt-4 border-t border-white/[0.06] w-full flex flex-col gap-3 relative z-10 lg:hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Highscore darüber in Gelb (ohne Pokalsymbol) */}
                          <div className="text-yellow-400 font-mono text-xs font-bold tracking-wide">
                            {currentHighScore ? (
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-yellow-400/5 border border-yellow-500/20 rounded-xl px-3 py-2 gap-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="uppercase text-[10px] text-yellow-400/70 tracking-widest leading-none">DEIN HIGHSCORE:</span>
                                  <span className="font-extrabold text-sm ml-0.5 leading-none">{currentHighScore.score.toLocaleString()}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-normal self-start sm:self-auto">
                                  Combo: <span className="text-[#FF66AA] font-bold">{currentHighScore.maxCombo}x</span> ({currentHighScore.accuracy}%)
                                </div>
                              </div>
                            ) : (
                              <div className="text-yellow-400/50 text-[10px] uppercase tracking-wider px-1">
                                Kein Highscore vorhanden
                              </div>
                            )}
                          </div>

                          {/* Schwierigkeiten buttons list */}
                          <div className="flex flex-wrap gap-1.5">
                            {group.versions.map((ver, subIdx) => {
                              const stars = getStarRating(ver);
                              const isSubSelected = subIdx === selectedVersionIdx;
                              return (
                                <button
                                  key={ver.id}
                                  onClick={() => handleDifficultySelect(originalIdx, subIdx)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border flex items-center gap-1.5 cursor-pointer ${
                                    isSubSelected
                                      ? 'bg-[#FF66AA] border-[#FF66AA] text-black font-extrabold uppercase shadow-[0_0_10px_rgba(255,102,170,0.3)]'
                                      : 'bg-[#14141A] border-white/5 text-gray-300 hover:border-white/15'
                                  }`}
                                >
                                  <span 
                                    className={`w-1.5 h-1.5 rounded-full ${isSubSelected ? 'bg-black' : ''}`} 
                                    style={{ backgroundColor: isSubSelected ? undefined : getStarColor(stars) }} 
                                  />
                                  <span>{ver.version}</span>
                                  <span className={`text-[9px] font-mono ${isSubSelected ? 'text-black/85 font-black' : 'text-gray-400'}`}>★{stars}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Quick Go play button for mobile to start */}
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => playBeatmap(originalIdx, selectedVersionIdx)}
                              className="flex-1 py-2.5 bg-gradient-to-r from-[#FF3388] to-[#FF66AA] hover:brightness-110 active:scale-[0.98] font-extrabold text-[11px] uppercase tracking-wide rounded-xl flex items-center justify-center gap-2 text-white shadow-md transition-all border-t border-white/10"
                            >
                              <Play className="w-3.5 h-3.5 fill-white text-white" />
                              <span>Ausgewählte Diff Starten</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Difficulty and settings dashboard details */}
        <div className="hidden lg:flex lg:col-span-5 flex-col gap-6">
          
          {activeGroup && activeVersion ? (
            <div className="border border-white/[0.08] bg-[#14141C] rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.6)] max-h-[78vh] overflow-y-auto custom-scrollbar">
              
              {/* Graphic Ambient backdrop with overlay cover blur */}
              {activeGroup.bgUrl && (
                <div 
                  className="absolute inset-0 bg-cover bg-center opacity-[0.12] pointer-events-none blur-md scale-105"
                  style={{ backgroundImage: `url(${activeGroup.bgUrl})` }}
                />
              )}

              {/* Title & Artist with a super polished layout */}
              <div className="relative z-10 border-b border-white/[0.06] pb-4">
                <span className="text-[10px] font-black font-mono tracking-widest text-[#FF66AA]">AUSGEWÄHLTER SONG</span>
                <h2 className="text-2xl font-black tracking-tight text-white mt-1 leading-7 line-clamp-2">{activeGroup.title}</h2>
                <p className="text-sm text-[#FF66AA] font-bold tracking-wider mt-1">{activeGroup.artist}</p>
                <div className="flex gap-4 mt-3 text-[10px] text-gray-450 font-mono uppercase tracking-wider">
                  <span>Mapper: <strong className="text-gray-300 font-semibold">{activeGroup.creator || 'Unbekannt'}</strong></span>
                </div>
              </div>

              {/* Versions / Difficulties selector grid */}
              <div className="flex flex-col gap-3 relative z-10">
                <span className="text-[10px] font-black font-mono tracking-widest text-gray-450 uppercase">SCHWIERIGKEITEN</span>
                <div className="flex flex-wrap gap-2">
                  {activeGroup.versions.map((ver, idx) => {
                    const stars = getStarRating(ver);
                    const isSelected = idx === selectedVersionIdx;
                    return (
                      <button
                        key={ver.id}
                        id={`btn-difficulty-${idx}`}
                        onClick={() => handleDifficultySelect(selectedGroupIdx, idx)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all border flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF66AA] border-[#FF66AA] text-black font-black uppercase shadow-[0_0_15px_rgba(255,102,170,0.35)] scale-105'
                            : 'bg-[#1C1C24] border-white/5 hover:border-white/15 text-gray-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black' : ''}`} style={{ backgroundColor: isSelected ? undefined : getStarColor(stars) }} />
                        <span>{ver.version}</span>
                        <span className={`text-[10px] font-mono ${isSelected ? 'text-black/80 font-black' : 'text-gray-400'}`}>★{stars}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Star Starry Difficulty Card Banner */}
              <div className={`relative z-10 border rounded-xl p-4 flex items-center justify-between ${getStarBgClass(getStarRating(activeVersion))}`}>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold font-mono tracking-widest uppercase">STAR RATING DIE DIFFICULTY</span>
                  <span className="text-3xl font-black tracking-tighter mt-1 italic font-mono flex items-baseline gap-1">
                    {getStarRating(activeVersion)}
                    <span className="text-base font-normal">★</span>
                  </span>
                </div>
                <div className="text-right flex flex-col items-end gap-1 font-mono text-[10px]">
                  <span className="font-extrabold uppercase bg-white/5 border border-white/15 px-2 py-0.5 rounded text-white tracking-wider">
                    {getStarRating(activeVersion) < 3.2 ? 'SIMPLE' : getStarRating(activeVersion) < 4.5 ? 'MEDIUM' : getStarRating(activeVersion) < 5.8 ? 'HARD' : 'INSANE!'}
                  </span>
                  <span className="text-gray-400 mt-1">Länge: {Math.floor((activeVersion.duration || 120000) / 60000)}m {Math.floor(((activeVersion.duration || 120000) % 60000) / 1000)}s</span>
                </div>
              </div>

              {/* Map parameters / Badges layout */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 border-t border-b border-white/[0.06] py-4.5 relative z-10 font-mono">
                <div className="flex flex-col">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-400 font-bold tracking-wider">APPROACH RATE (AR)</span>
                    <span className="text-[#FF66AA] text-xs font-black">{activeVersion.approachRate}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1.5 p-0.5">
                    <div className="h-full bg-[#FF66AA] rounded-full shadow-[0_0_8px_rgb(255,102,170)]" style={{ width: `${activeVersion.approachRate * 10}%` }} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-400 font-bold tracking-wider">CIRCLE SIZE (CS)</span>
                    <span className="text-cyan-400 text-xs font-black">{activeVersion.circleSize}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1.5 p-0.5">
                    <div className="h-full bg-cyan-450 rounded-full shadow-[0_0_8px_rgb(34,211,238)]" style={{ width: `${activeVersion.circleSize * 10}%` }} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-400 font-bold tracking-wider">OVERALL DIFFICULTY (OD)</span>
                    <span className="text-yellow-400 text-xs font-black">{activeVersion.overallDifficulty}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1.5 p-0.5">
                    <div className="h-full bg-yellow-450 rounded-full shadow-[0_0_8px_rgb(250,204,21)]" style={{ width: `${activeVersion.overallDifficulty * 10}%` }} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-400 font-bold tracking-wider">HP DRAIN (HP)</span>
                    <span className="text-emerald-450 text-xs font-black">{activeVersion.hpDrain}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1.5 p-0.5">
                    <div className="h-full bg-emerald-450 rounded-full shadow-[0_0_8px_rgb(52,211,153)]" style={{ width: `${activeVersion.hpDrain * 10}%` }} />
                  </div>
                </div>
              </div>

              {/* Live MODS selection panel right in Details panel! */}
              <div className="flex flex-col gap-2 relative z-10">
                <span className="text-[10px] font-black font-mono tracking-widest text-gray-450 uppercase">SPIEL MODS</span>
                <div id="settings-mods-selector" className="flex gap-2">
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, autoPlay: !settings.autoPlay })}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold font-mono text-xs cursor-pointer shadow-md transition-all ${
                      settings.autoPlay 
                        ? 'bg-yellow-450 border-yellow-500 text-black font-extrabold shadow-yellow-500/20 scale-105' 
                        : 'bg-[#181820] border-white/5 text-gray-400 font-medium hover:border-white/10'
                    }`}
                    title="Auto-Play: Lass den Bot fehlerfrei spielen"
                  >
                    AT
                  </button>
                  <button 
                    onClick={() => {
                      if (settings.disableClicking) return;
                      onUpdateSettings({ ...settings, useKeyboard: !settings.useKeyboard });
                    }}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold font-mono text-xs cursor-pointer shadow-md transition-all ${
                      settings.useKeyboard 
                        ? 'bg-cyan-400 border-cyan-500 text-black font-extrabold shadow-cyan-500/20 scale-105' 
                        : 'bg-[#181820] border-white/5 text-gray-400 font-medium hover:border-white/10'
                    }`}
                    title={settings.disableClicking ? "Tastatursteuerung ist erzwungen (Klicks im Spiel deaktiviert)" : "Keys: Klicks per X/Y/Z ausführen"}
                    style={settings.disableClicking ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    K1
                  </button>
                  <button 
                    onClick={() => {
                      const nextVal = !settings.disableClicking;
                      onUpdateSettings({
                        ...settings,
                        disableClicking: nextVal,
                        useKeyboard: nextVal ? true : settings.useKeyboard
                      });
                    }}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold font-mono text-xs cursor-pointer shadow-md transition-all ${
                      settings.disableClicking 
                        ? 'bg-red-500 border-red-600 text-white font-extrabold shadow-red-500/20 scale-105' 
                        : 'bg-[#181820] border-white/5 text-gray-400 font-medium hover:border-white/10'
                    }`}
                    title="No Click: Tippen/Klicks im Spiel deaktivieren (nur X/Y/Z Tastatur)"
                  >
                    TK
                  </button>
                  <button 
                    onClick={() => onUpdateSettings({ ...settings, touchControls: !settings.touchControls })}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold font-mono text-xs cursor-pointer shadow-md transition-all ${
                      settings.touchControls 
                        ? 'bg-pink-500 border-pink-600 text-black font-extrabold shadow-pink-500/20 scale-105' 
                        : 'bg-[#181820] border-white/5 text-gray-400 font-medium hover:border-white/10'
                    }`}
                    title="Touch Zones: Visuelle Tippindikatoren im Spiel anzeigen"
                  >
                    VZ
                  </button>
                </div>
              </div>

              {/* High Score Panel resembling osu! ranking */}
              <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-yellow-400 fill-yellow-400/20" />
                  <div>
                    <h4 className="text-[10px] font-black font-mono text-gray-400 uppercase tracking-wider">DEIN HIGHSCORE</h4>
                    <span className="text-base font-black mt-0.5 block font-mono text-white tracking-wide">
                      {activeHighScore ? activeHighScore.score.toLocaleString() : 'Keine Records'}
                    </span>
                  </div>
                </div>
                {activeHighScore && (
                  <div className="text-right text-xs font-mono text-gray-300">
                    <div>Max Combo: <span className="text-[#FF66AA] font-bold">{activeHighScore.maxCombo}x</span></div>
                    <div>Präzision: <span className="text-cyan-400 font-extrabold">{activeHighScore.accuracy}%</span></div>
                  </div>
                )}
              </div>

              {/* Start Game Action Button - Massive custom neon style! */}
              <button
                id="btn-start-playing"
                onClick={handleStartPlay}
                className="w-full py-4 bg-gradient-to-r from-[#FF3388] via-[#FF66AA] to-[#FF88CC] hover:from-[#ff55a3] hover:to-[#ffa6db] active:scale-[0.98] font-black text-xl italic tracking-tight rounded-2xl flex items-center justify-center gap-3 text-white shadow-[0_0_35px_rgba(255,51,153,0.45)] hover:shadow-[0_0_45px_rgba(255,51,153,0.6)] transition-all relative z-10 cursor-pointer uppercase border-t border-white/20 duration-200"
              >
                <Play className="w-6 h-6 fill-white text-white" />
                <span className="font-extrabold tracking-wider drop-shadow-md">LET&apos;S GO (PLAY)</span>
              </button>

            </div>
          ) : (
            <div className="border border-white/5 bg-[#14141A]/60 rounded-2xl p-12 text-center text-gray-500">
              Wähle eine Beatmap, um Details anzuzeigen und zu spielen.
            </div>
          )}

          {/* Quick Info help box */}
          <div className="border border-[#FF66AA]/10 bg-[#FF66AA]/5 rounded-2xl p-5 flex gap-4">
            <HelpCircle className="w-5 h-5 text-[#FF66AA] shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 flex flex-col gap-3 leading-relaxed">
              <span className="font-bold text-gray-200 tracking-wide">Führungsgesten &amp; Tapping</span>
              <p>
                Du kannst die Hitcircles direkt auf deinem Touchscreen antippen! Verwende die visuelle Tippzonen (AT / K1) um für Dualtapping gerüstet zu sein.
              </p>
              <p>
                PC-Keyboard-Spieler: Ziele mit deiner Maus auf die Kreise und tippe abwechselnd auf <kbd className="bg-white/10 px-1 rounded text-white font-mono border border-white/10 mx-0.5">Z</kbd> und <kbd className="bg-white/10 px-1 rounded text-white font-mono border border-white/10 mx-0.5">X</kbd> für Streams!
              </p>

              <div className="border-t border-white/10 my-1.5 pt-2">
                <span className="font-bold text-gray-200 tracking-wide block mb-1">iPad &amp; iOS FAQ: Gelöschte Songs &amp; Lokaler Start</span>
                <p className="mb-2">
                  <strong className="text-[#FF66AA]">Warum verschwinden importierte Songs nach einer Weile?</strong><br />
                  iOS und iPadOS löschen Browserdaten (IndexedDB) ungenutzter Webseiten nach 7 Tagen Inaktivität, um Speicher zu sparen. Um das zu verhindern, klicke im Safari auf den <strong>Teilen-Button &gt; &quot;Zum Home-Bildschirm hinzufügen&quot;</strong>. Als installierte PWA speichert iOS deine Daten dauerhaft. Alternativ kannst du deine <code className="bg-white/5 px-1 rounded">.osz</code>-Dateien jederzeit in Sekundenschnelle wieder hineinziehen (vollkommen offline!).
                </p>
                <p>
                  <strong className="text-cyan-400">Wie startet man die App lokal auf dem iPad (z.B. in der Koder App)?</strong><br />
                  Das bloße Öffnen der <code className="bg-white/5 px-1 rounded">index.html</code> aus dem Dateisystem scheitert meist an lokalen Sicherheits-Sperren (CORS) deines Browsers. Da wir das Projekt für relative Pfade (<code className="bg-white/5 px-1 rounded">base: &apos;./&apos;</code>) optimiert haben, ist der Start ganz einfach: Starte in der <strong>Koder App</strong> den eingebauten <strong>Webserver (Local Preview Web Server)</strong> für dieses Verzeichnis, anstatt die Datei direkt als Quellcode-Pfad zu laden. Dann funktioniert die App tadellos offline auf deinem iPad!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Panel Lateral Drawer */}
      {showSettingsDrawer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-[#0A0A0C]/95 backdrop-blur-md w-full max-w-md border-l border-white/10 h-full flex flex-col shadow-2xl p-6 text-white text-sm relative overflow-y-auto">
            
            {/* Drawer Close */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/15">
              <div className="flex items-center gap-2 text-[#FF66AA]">
                <Sliders className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Spieleinstellungen</h3>
              </div>
              <button 
                id="btn-close-settings-drawer"
                onClick={() => setShowSettingsDrawer(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all border border-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-6 flex-1">
              {/* Replay-System Option */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Replay-System</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Erlaube das Aufzeichnen und Importieren von Replays</p>
                </div>
                <button
                  id="btn-toggle-replaysystem"
                  onClick={() => toggleSettingBool('enableReplays')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.enableReplays ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.enableReplays ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Hitsounds feedback options */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Hitsounds</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Akustische Klicks bei erfolgreichen Treffern</p>
                </div>
                <button
                  id="btn-toggle-hitsounds"
                  onClick={() => toggleSettingBool('hitsounds')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.hitsounds ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.hitsounds ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Volume tracker */}
              <div className="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold">Spiel-Gesamtlautstärke</span>
                  <span className="font-mono text-[#FF66AA] font-bold">{Math.round(settings.volume * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  {settings.volume === 0 ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-[#FF66AA]" />}
                  <input
                    id="input-settings-volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.volume}
                    onChange={(e) => updateSettingNum('volume', parseFloat(e.target.value))}
                    className="flex-1 accent-[#FF66AA] bg-white/10 h-1.5 rounded-lg cursor-pointer [outline:none]"
                  />
                </div>
              </div>

              {/* Dim layer background slider */}
              <div className="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold">Hintergrund-Abdunkelung</span>
                  <span className="font-mono text-[#FF66AA] font-bold">{settings.dimLevel}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <EyeOff className="w-5 h-5 text-[#FF66AA]" />
                  <input
                    id="input-settings-dim"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.dimLevel}
                    onChange={(e) => updateSettingNum('dimLevel', parseInt(e.target.value))}
                    className="flex-1 accent-[#FF66AA] bg-white/10 h-1.5 rounded-lg cursor-pointer [outline:none]"
                  />
                </div>
              </div>

              {/* Auto scale playfield switch */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Feldgröße automatisch anpassen</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Passt das gesamte Spielfeld an den Bildschirm an</p>
                </div>
                <button
                  id="btn-toggle-autoscale"
                  onClick={() => toggleSettingBool('autoScaleField')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.autoScaleField ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.autoScaleField ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* UI/Playfield Scale slider */}
              <div className="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">
                    {settings.autoScaleField ? 'Trigger-Objekte Skalierung' : 'Spielfeld & UI-Skalierung'}
                  </span>
                  <span className="font-mono text-[#FF66AA] font-bold">{Math.round(settings.uiScale * 100)}%</span>
                </div>
                <p className="text-xs text-gray-400 -mt-1.5">
                  {settings.autoScaleField 
                    ? 'Skaliert die Hitcircles und Trigger-Objekte unabhängig vom Spielfeld'
                    : 'Skaliert das gesamte Spielfeld inklusive aller Symbole starr'}
                </p>
                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-[#FF66AA]" />
                  <input
                    id="input-settings-uiscale"
                    type="range"
                    min="0.5"
                    max="1.7"
                    step="0.05"
                    value={settings.uiScale || 1.0}
                    onChange={(e) => updateSettingNum('uiScale', parseFloat(e.target.value))}
                    className="flex-1 accent-[#FF66AA] bg-white/10 h-1.5 rounded-lg cursor-pointer [outline:none]"
                  />
                </div>
              </div>

              {/* Audio Offset Latenz slider */}
              <div className="flex flex-col bg-white/[0.01] border border-white/5 rounded-xl p-4 gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">Audio-Latenz-Ausgleich (Offset)</span>
                  <span className="font-mono text-[#FF66AA] font-bold">{settings.audioOffset > 0 ? '+' : ''}{settings.audioOffset} ms</span>
                </div>
                <p className="text-xs text-gray-400 -mt-1.5">
                  Gleicht Verzögerungen aus (empfohlen: positive Werte über +50ms für Bluetooth-Audiogeräte).
                </p>
                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-[#FF66AA]" />
                  <input
                    id="input-settings-audio-offset"
                    type="range"
                    min="-150"
                    max="250"
                    step="5"
                    value={settings.audioOffset !== undefined ? settings.audioOffset : 0}
                    onChange={(e) => updateSettingNum('audioOffset', parseInt(e.target.value))}
                    className="flex-1 accent-[#FF66AA] bg-white/10 h-1.5 rounded-lg cursor-pointer [outline:none]"
                  />
                </div>
              </div>

               {/* Keyboard option Z / X */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Tastatursteuerung</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Erlaube X/Y/Z-Tastendrücke für Klicks (unterstützt QWERTZ & QWERTY)</p>
                </div>
                <button
                  id="btn-toggle-keyboard"
                  onClick={() => toggleSettingBool('useKeyboard')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.useKeyboard ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                  disabled={settings.disableClicking}
                  style={settings.disableClicking ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.useKeyboard ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Disable Clicks during Gameplay option */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Tippen / Klicks im Spiel deaktivieren</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Deaktiviert Mausklicks/Taps für Hits auf Kreise. Aim per Pointer weiterhin aktiv. Erfordert Tastatursteuerung.</p>
                </div>
                <button
                  id="btn-toggle-disable-clicking"
                  onClick={() => toggleSettingBool('disableClicking')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.disableClicking ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.disableClicking ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Touch zones layout visualization */}
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-xl p-4">
                <div>
                  <h4 className="font-semibold text-white">Visuelle Touch-Zonen</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Zeigt optische Tipp-Indikatoren unten links/rechts</p>
                </div>
                <button
                  id="btn-toggle-touch-controls"
                  onClick={() => toggleSettingBool('touchControls')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer [outline:none] ${
                    settings.touchControls ? 'bg-[#FF66AA] shadow-[0_0_10px_rgba(255,102,170,0.4)]' : 'bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    settings.touchControls ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Skin Selection & Import */}
              <div className="flex flex-col bg-[#111118] border border-white/5 rounded-xl p-4 gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <h4 className="font-semibold text-white text-xs tracking-wider uppercase">Skin / Design-Auswahl</h4>
                  <span className="text-[9px] text-[#FF66AA] font-bold uppercase tracking-wider bg-[#FF66AA]/10 px-1.5 py-0.5 rounded border border-[#FF66AA]/10 font-mono">NEU</span>
                </div>
                
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, skinPreset: 'argon' });
                    }}
                    className={`py-2 px-0.5 rounded-xl text-[10px] font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      settings.skinPreset === 'argon' 
                        ? 'bg-[#FF66AA]/25 border-[#FF66AA] text-white shadow-[0_0_10px_rgba(255,102,170,0.2)]' 
                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-[7.5px] text-gray-500 font-bold -mb-1">ARGON</span>
                    Argon
                  </button>
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, skinPreset: 'lazer' });
                    }}
                    className={`py-2 px-0.5 rounded-xl text-[10px] font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      settings.skinPreset === 'lazer' 
                        ? 'bg-[#FF66AA]/25 border-[#FF66AA] text-white shadow-[0_0_10px_rgba(255,102,170,0.2)]' 
                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-[7.5px] text-gray-500 font-bold -mb-1">NEON</span>
                    lazer
                  </button>
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, skinPreset: 'whitecat' });
                    }}
                    className={`py-2 px-0.5 rounded-xl text-[10px] font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      settings.skinPreset === 'whitecat' 
                        ? 'bg-[#FF66AA]/25 border-[#FF66AA] text-white shadow-[0_0_10px_rgba(255,102,170,0.2)]' 
                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-[7.5px] text-gray-500 font-bold -mb-1">PRO</span>
                    White Cat
                  </button>
                  <button
                    onClick={() => {
                      onUpdateSettings({ ...settings, skinPreset: 'classic' });
                    }}
                    className={`py-2 px-0.5 rounded-xl text-[10px] font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      settings.skinPreset === 'classic' 
                        ? 'bg-[#FF66AA]/25 border-[#FF66AA] text-white shadow-[0_0_10px_rgba(255,102,170,0.2)]' 
                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-[7.5px] text-gray-500 font-bold -mb-1">ALT</span>
                    Classic
                  </button>
                  <button
                    onClick={() => {
                      onUpdateSettings({ 
                        ...settings, 
                        skinPreset: 'custom', 
                        customSkinColors: settings.customSkinColors || {
                          hitcircleFill: '#3b82f6',
                          hitcircleBorder: '#ffffff',
                          approachCircleColor: '#60a5fa',
                          textColor: '#ffffff',
                          sliderTrackColor: '#2563eb',
                        } 
                      });
                    }}
                    className={`py-2 px-0.5 rounded-xl text-[10px] font-black transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      settings.skinPreset === 'custom' 
                        ? 'bg-[#FF66AA]/25 border-[#FF66AA] text-white shadow-[0_0_10px_rgba(255,102,170,0.2)]' 
                        : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-[7.5px] text-gray-500 font-bold -mb-1">DIY</span>
                    Eigener
                  </button>
                </div>

                {settings.skinPreset === 'custom' && (
                  <div className="flex flex-col gap-3 mt-1 bg-black/40 border border-white/5 p-3 rounded-lg text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#FF65A9] text-[10px] tracking-wide uppercase font-mono">Custom Skin Editor</span>
                      <button 
                        onClick={() => {
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = '.json';
                          fileInput.onchange = async (e: any) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const txt = await file.text();
                                const parsed = JSON.parse(txt);
                                if (parsed.skinPreset === 'custom' || parsed.customSkinColors) {
                                  onUpdateSettings({
                                    ...settings,
                                    skinPreset: 'custom',
                                    customSkinColors: {
                                      hitcircleFill: parsed.customSkinColors?.hitcircleFill || '#3b82f6',
                                      hitcircleBorder: parsed.customSkinColors?.hitcircleBorder || '#ffffff',
                                      approachCircleColor: parsed.customSkinColors?.approachCircleColor || '#60a5fa',
                                      textColor: parsed.customSkinColors?.textColor || '#ffffff',
                                      sliderTrackColor: parsed.customSkinColors?.sliderTrackColor || '#2563eb',
                                    }
                                  });
                                } else {
                                  alert('Ungültige Skin-Datei. Benötigt customSkinColors Eigenschaften.');
                                }
                              } catch (err) {
                                alert('Einlesen der Skin Datei fehlgeschlagen.');
                              }
                            }
                          };
                          fileInput.click();
                        }}
                        className="text-[10px] bg-white/5 text-pink-400 hover:bg-pink-500/20 px-2 py-0.5 rounded transition-all cursor-pointer font-bold border border-white/5"
                      >
                        JSON Importieren
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div>
                        <label className="text-gray-400 block text-[9px] uppercase tracking-wider mb-1">Circle Füllung</label>
                        <div className="flex gap-1.5 items-center bg-[#15151F] border border-white/5 rounded-md p-1">
                          <input 
                            type="color" 
                            value={settings.customSkinColors?.hitcircleFill || '#3b82f6'} 
                            onChange={(e) => onUpdateSettings({
                              ...settings,
                              customSkinColors: {
                                ...(settings.customSkinColors || { hitcircleFill: '#3b82f6', hitcircleBorder: '#ffffff', approachCircleColor: '#60a5fa', textColor: '#ffffff', sliderTrackColor: '#2563eb' }),
                                hitcircleFill: e.target.value
                              }
                            })}
                            className="w-5 h-5 bg-transparent border-0 rounded cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
                          />
                          <span className="text-[9px] font-mono text-gray-400 uppercase">{settings.customSkinColors?.hitcircleFill || '#3B82F6'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-400 block text-[9px] uppercase tracking-wider mb-1">Circle Rand</label>
                        <div className="flex gap-1.5 items-center bg-[#15151F] border border-white/5 rounded-md p-1">
                          <input 
                            type="color" 
                            value={settings.customSkinColors?.hitcircleBorder || '#ffffff'} 
                            onChange={(e) => onUpdateSettings({
                              ...settings,
                              customSkinColors: {
                                ...(settings.customSkinColors || { hitcircleFill: '#3b82f6', hitcircleBorder: '#ffffff', approachCircleColor: '#60a5fa', textColor: '#ffffff', sliderTrackColor: '#2563eb' }),
                                hitcircleBorder: e.target.value
                              }
                            })}
                            className="w-5 h-5 bg-transparent border-0 rounded cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
                          />
                          <span className="text-[9px] font-mono text-gray-400 uppercase">{settings.customSkinColors?.hitcircleBorder || '#FFFFFF'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-400 block text-[9px] uppercase tracking-wider mb-1">Approach-Kreis</label>
                        <div className="flex gap-1.5 items-center bg-[#15151F] border border-white/5 rounded-md p-1">
                          <input 
                            type="color" 
                            value={settings.customSkinColors?.approachCircleColor || '#60a5fa'} 
                            onChange={(e) => onUpdateSettings({
                              ...settings,
                              customSkinColors: {
                                ...(settings.customSkinColors || { hitcircleFill: '#3b82f6', hitcircleBorder: '#ffffff', approachCircleColor: '#60a5fa', textColor: '#ffffff', sliderTrackColor: '#2563eb' }),
                                approachCircleColor: e.target.value
                              }
                            })}
                            className="w-5 h-5 bg-transparent border-0 rounded cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
                          />
                          <span className="text-[9px] font-mono text-gray-400 uppercase">{settings.customSkinColors?.approachCircleColor || '#60A5FA'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-400 block text-[9px] uppercase tracking-wider mb-1">Slider Spur</label>
                        <div className="flex gap-1.5 items-center bg-[#15151F] border border-white/5 rounded-md p-1">
                          <input 
                            type="color" 
                            value={settings.customSkinColors?.sliderTrackColor || '#2563eb'} 
                            onChange={(e) => onUpdateSettings({
                              ...settings,
                              customSkinColors: {
                                ...(settings.customSkinColors || { hitcircleFill: '#3b82f6', hitcircleBorder: '#ffffff', approachCircleColor: '#60a5fa', textColor: '#ffffff', sliderTrackColor: '#2563eb' }),
                                sliderTrackColor: e.target.value
                              }
                            })}
                            className="w-5 h-5 bg-transparent border-0 rounded cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
                          />
                          <span className="text-[9px] font-mono text-gray-400 uppercase">{settings.customSkinColors?.sliderTrackColor || '#2563EB'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Footer drawer copyright */}
            <div className="border-t border-white/10 pt-4 text-center text-xs text-gray-500 font-mono mt-8">
              osu! Touch Player • Offline Synthesizer
            </div>
          </div>
        </div>
      )}

      {/* Replay list Modal - Highly optimized for Mobile & Portrait/Hochformat */}
      {activeReplayModalGroup && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0D0D12] border border-white/10 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col gap-5 max-h-[85vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 text-[#FF66AA]">
                <Tv className="w-5 h-5 text-[#FF66AA]" />
                <h3 className="font-extrabold text-white text-base md:text-lg tracking-tight">Verfügbare Replays</h3>
              </div>
              <button
                onClick={() => setActiveReplayModalGroup(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center border border-white/5 cursor-pointer select-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="shrink-0 flex flex-col gap-1.5 bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl">
              <h4 className="font-bold text-white text-sm line-clamp-1">{activeReplayModalGroup.title}</h4>
              <p className="text-xs text-gray-400 line-clamp-1">{activeReplayModalGroup.artist}</p>
            </div>

            {/* List Wrapper - Scrollable & Custom styled vertical scrollbar */}
            <div className="flex-1 overflow-y-auto pr-1.5 custom-scrollbar flex flex-col gap-3 min-h-0">
              {(() => {
                const versions = activeReplayModalGroup.versions;
                const allReplays = versions.flatMap(v => 
                  getReplaysForBeatmap(v.id).map(r => ({ ...r, verObj: v }))
                );

                if (allReplays.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500 text-xs">
                      Keine Replays vorhanden. Spiele eine Runde im Replay-Modus oder importiere eine JSON-Replay-Datei.
                    </div>
                  );
                }

                return allReplays.map((replay) => {
                  const rating = getStarRating(replay.verObj);
                  const ratingColor = getStarColor(rating);
                  const isDefaultReplay = replay.id.startsWith('default-replay-');

                  return (
                    <div 
                      key={replay.id}
                      className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-[#FF66AA]/25 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white font-mono truncate">{replay.playerName}</span>
                          {isDefaultReplay && (
                            <span className="text-[8px] bg-yellow-405/20 text-yellow-400 border border-yellow-405/20 px-1.5 py-0.5 rounded font-extrabold uppercase font-mono tracking-widest shrink-0">BOT</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 font-mono mt-0.5">
                          <span className="text-white/60 bg-white/5 border border-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                            Difficulty: <span className="font-black text-[#FF65A9]">{replay.verObj.version}</span>
                          </span>
                          <span className="text-gray-500 self-center">•</span>
                          <span 
                            className="font-extrabold" 
                            style={{ color: ratingColor }}
                          >
                            ★ {rating}
                          </span>
                          <span className="text-gray-500 self-center">•</span>
                          <span>{replay.date}</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mt-2 sm:mt-1 font-mono text-[10px] bg-black/25 border border-white/[0.04] p-2 rounded-xl">
                          <div>
                            <span className="text-gray-500 block font-bold text-[9px]">PUNKTE</span>
                            <span className="text-white font-black">{replay.score.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block font-bold text-[9px]">COMBO</span>
                            <span className="text-[#FF66AA] font-black">{replay.maxCombo}x</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block font-bold text-[9px]">GENAUIGKEIT</span>
                            <span className="text-cyan-400 font-black">{replay.accuracy}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-end shrink-0">
                        {!isDefaultReplay && (
                          <button
                            onClick={() => {
                              deleteReplay(replay.beatmapId, replay.id);
                              setDeletedTrigger(prev => prev + 1);
                            }}
                            className="p-2 border border-white/5 hover:border-red-500/30 hover:text-red-400 text-gray-500 bg-white/5 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                            title="Replay löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => playReplay(replay.verObj, replay.playerName)}
                          className="px-4 py-2 bg-gradient-to-r from-[#FF3388] to-[#FF66AA] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 hover:brightness-110 flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(255,102,170,0.15)]"
                        >
                          <Play className="w-3 h-3 fill-white text-white" />
                          <span>Watch</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="text-center text-[10px] text-gray-400 font-mono shrink-0">
              * Replays verwenden Autoplay, um den perfekten Durchlauf deines Scores wiederzugeben.
            </div>

          </div>
        </div>
      )}

      {/* Loading Overlay spinner */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[150] flex flex-col items-center justify-center gap-4 animate-fade-in animate-duration-100">
          <div className="w-12 h-12 border-4 border-[#FF66AA]/30 border-t-[#FF66AA] animate-spin rounded-full"></div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-semibold text-white leading-5">Bitte warten</span>
            <span className="text-sm font-mono text-[#FF66AA]">{loadingStep || 'Lädt Spieldaten...'}</span>
          </div>
        </div>
      )}

      {/* General Error Notification Popups */}
      {errorMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-red-600/15 border border-red-500/35 px-5 py-3 rounded-xl flex items-center gap-3 text-red-400 text-sm shadow-xl z-[200] animate-fade-in max-w-md w-full">
          <div className="w-2 h-2 rounded-full bg-red-400 shrink-0"></div>
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button 
            id="btn-dismiss-error"
            onClick={() => setErrorMsg(null)}
            className="text-gray-400 hover:text-white font-bold ml-2 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

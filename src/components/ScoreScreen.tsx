import React, { useEffect, useState } from 'react';
import { Beatmap, PlayStats, GameSettings } from '../types';
import { RotateCcw, Home, Trophy, Award, Sparkles } from 'lucide-react';
import { saveReplay } from '../utils/replays';

interface ScoreScreenProps {
  beatmap: Beatmap;
  stats: PlayStats;
  onRetry: () => void;
  onHome: () => void;
  settings?: GameSettings;
}

export const ScoreScreen: React.FC<ScoreScreenProps> = ({
  beatmap,
  stats,
  onRetry,
  onHome,
  settings,
}) => {
  const [isHighscore, setIsHighscore] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>('');
  const [isReplaySaved, setIsReplaySaved] = useState<boolean>(false);

  const getAccuracy = () => {
    const total = stats.hits300 + stats.hits100 + stats.hits50 + stats.misses;
    if (total === 0) return 0;
    const actual = stats.hits300 * 300 + stats.hits100 * 100 + stats.hits50 * 50;
    return parseFloat(((actual / (total * 300)) * 100).toFixed(2));
  };

  const accuracy = getAccuracy();

  // Determine Rank grade
  const getRank = (): { grade: string; color: string; bg: string } => {
    if (stats.misses === 0 && accuracy === 100) {
      return { grade: 'SS', color: 'text-yellow-400 animate-pulse', bg: 'from-yellow-400/20 to-amber-500/10 border-yellow-500/40' };
    }
    if (stats.misses === 0 && accuracy >= 95) {
      return { grade: 'S', color: 'text-pink-400', bg: 'from-pink-500/20 to-purple-500/10 border-pink-500/40' };
    }
    if ((accuracy >= 90) || (accuracy >= 95 && stats.misses > 0)) {
      return { grade: 'A', color: 'text-green-400', bg: 'from-green-500/20 to-emerald-500/10 border-green-500/40' };
    }
    if (accuracy >= 80) {
      return { grade: 'B', color: 'text-blue-400', bg: 'from-blue-500/20 to-indigo-500/10 border-blue-500/40' };
    }
    if (accuracy >= 70) {
      return { grade: 'C', color: 'text-orange-400', bg: 'from-orange-500/20 to-amber-500/10 border-orange-500/40' };
    }
    return { grade: 'D', color: 'text-red-400', bg: 'from-red-500/20 to-rose-500/10 border-red-500/40' };
  };

  const rank = getRank();

  useEffect(() => {
    // Check and save personal best locally
    const storageKey = `osutouch_score_${beatmap.id}`;
    const raw = localStorage.getItem(storageKey);
    let shouldSave = false;

    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (stats.score > saved.score) {
          shouldSave = true;
        }
      } catch (e) {
        shouldSave = true;
      }
    } else {
      shouldSave = true;
    }

    if (shouldSave) {
      localStorage.setItem(storageKey, JSON.stringify({
        score: stats.score,
        maxCombo: stats.maxCombo,
        accuracy: accuracy,
      }));
      setIsHighscore(true);
    }
  }, [beatmap.id, stats, accuracy]);

  const handleSaveReplayClick = () => {
    if (!playerName.trim()) return;
    saveReplay(beatmap.id, {
      beatmapId: beatmap.id,
      playerName: playerName.trim(),
      score: stats.score,
      maxCombo: stats.maxCombo,
      accuracy: accuracy,
      date: new Date().toLocaleDateString('de-DE'),
    });
    setIsReplaySaved(true);
  };

  return (
    <div className="h-screen w-full bg-[#0A0A0C] flex flex-col items-center justify-start md:justify-center p-4 text-white relative select-none overflow-y-auto sm:py-8 md:py-12 custom-scrollbar">
      
      {/* Decorative cyber ambient backgrounds */}
      <div 
        className="absolute inset-0 opacity-15 overflow-hidden pointer-events-none"
        style={{ 
          backgroundImage: 'radial-gradient(circle at center, rgba(255,102,170,0.15) 0%, transparent 70%), linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 40px 40px, 40px 40px'
        }}
      />

      <div className="max-w-2xl w-full border border-white/10 bg-[#16161C] rounded-3xl p-6 md:p-8 flex flex-col gap-8 shadow-2xl relative z-10 animate-fade-in my-auto">
        
        {/* Head Map Title details */}
        <div className="text-center">
          <span className="text-[10px] font-bold tracking-widest text-[#FF66AA] bg-[#FF66AA]/10 border border-[#FF66AA]/20 px-3.5 py-1 rounded-full uppercase font-mono">
            Runde Beendet
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mt-4 line-clamp-1">{beatmap.title}</h2>
          <p className="text-xs text-gray-400 font-mono mt-1 pr-1 line-clamp-1">{beatmap.artist} • [{beatmap.version}]</p>
        </div>

        {/* Highlight Score with big Grade medal letter */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          <div className={`md:col-span-4 rounded-2xl border bg-[#0D0D10] ${rank.bg} h-40 flex flex-col items-center justify-center p-4 select-none relative group overflow-hidden shadow-inner`}>
            <span className="text-[10px] font-bold font-mono text-gray-400 absolute top-3 tracking-widest">RANG</span>
            <span className={`text-7xl font-sans font-black italic tracking-tighter ${rank.color} drop-shadow-md`}>
              {rank.grade}
            </span>
          </div>

          <div className="md:col-span-8 flex flex-col gap-3">
            
            {isHighscore && (
              <div className="bg-[#FF66AA]/15 border border-[#FF66AA]/30 text-[#FF66AA] px-4 py-2 rounded-xl text-xs flex items-center gap-2 font-bold uppercase tracking-wider font-mono animate-pulse">
                <Sparkles className="w-4 h-4 fill-[#FF66AA] shrink-0" />
                <span>NEUER PERSÖNLICHER BESTWERT!</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0D0D10] border border-white/5 p-4 rounded-xl">
                <span className="text-[10px] font-bold font-mono text-gray-400 tracking-wider">PUNKTE</span>
                <div className="text-2xl font-black tracking-tight text-white mt-1 font-mono">
                  {stats.score.toLocaleString()}
                </div>
              </div>

              <div className="bg-[#0D0D10] border border-white/5 p-4 rounded-xl">
                <span className="text-[10px] font-bold font-mono text-gray-400 tracking-wider">GENAUIGKEIT</span>
                <div className="text-2xl font-black tracking-tight text-cyan-400 mt-1 font-mono">
                  {accuracy}%
                </div>
              </div>

              <div className="bg-[#0D0D10] border border-white/5 p-4 rounded-xl col-span-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold font-mono text-gray-400 tracking-wider">MAXIMALE COMBO</span>
                  <div className="text-xl font-bold tracking-tight text-[#FF66AA] mt-0.5 font-mono">
                    {stats.maxCombo}x
                  </div>
                </div>
                <Award className="w-8 h-8 text-[#FF66AA]/25 mr-2" />
              </div>
            </div>

          </div>
        </div>

        {/* Hits Detail Breakdown breakdown list */}
        <div className="flex flex-col gap-2 border-t border-white/5 pt-6">
          <span className="text-[10px] font-mono tracking-wider text-gray-400 uppercase font-bold">Treffer-Analyse</span>
          
          <div className="grid grid-cols-4 gap-3 text-center">
            
            <div className="bg-green-500/5 border border-green-500/20 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-xs font-bold text-green-400 font-mono">300</span>
              <span className="text-lg font-black font-mono text-white">{stats.hits300}</span>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-xs font-bold text-blue-400 font-mono">100</span>
              <span className="text-lg font-black font-mono text-white">{stats.hits100}</span>
            </div>

            <div className="bg-yellow-500/5 border border-yellow-500/20 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-xs font-bold text-yellow-400 font-mono">50</span>
              <span className="text-lg font-black font-mono text-white">{stats.hits50}</span>
            </div>

            <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-xs font-bold text-red-500 font-mono">Miss</span>
              <span className="text-lg font-black font-mono text-white">{stats.misses}</span>
            </div>
          </div>
        </div>

        {/* Save Replay block if enabled */}
        {settings?.enableReplays && (
          <div className="bg-[#0D0D10]/80 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#FF66AA] uppercase tracking-wider font-mono">Replay-System</span>
              <span className="text-[9px] text-[#FF66AA]/60 bg-[#FF66AA]/10 px-2 py-0.5 rounded border border-[#FF66AA]/10 font-mono">BETA</span>
            </div>
            <p className="text-xs text-gray-400">
              Möchtest du dieses Ergebnis als Replay speichern, um es später in der Songauswahl anzusehen?
            </p>
            {isReplaySaved ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl text-center">
                ✓ Replay erfolgreich gespeichert! Es wird nun neben der Beatmap angezeigt.
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={18}
                  placeholder="Dein Spielername..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:border-[#FF66AA] focus:outline-none transition-all placeholder:text-gray-600"
                />
                <button
                  onClick={handleSaveReplayClick}
                  disabled={!playerName.trim()}
                  className="bg-yellow-450 hover:bg-yellow-500 text-black font-extrabold px-5 py-2 rounded-xl text-xs uppercase tracking-wide cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Speichern
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-4 border-t border-white/5 pt-6">
          <button
            id="btn-score-retry"
            onClick={onRetry}
            className="flex-1 py-3 bg-[#FF66AA] hover:bg-[#ff86b8] active:scale-95 text-black font-black uppercase text-sm tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,102,170,0.3)] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-black stroke-[3px]" />
            <span>Wiederholen</span>
          </button>

          <button
            id="btn-score-home"
            onClick={onHome}
            className="flex-1 py-3 bg-[#111114] hover:bg-[#1a1a20] active:scale-95 text-gray-200 border border-white/10 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4 text-gray-400" />
            <span>Songauswahl</span>
          </button>
        </div>

      </div>
    </div>
  );
};

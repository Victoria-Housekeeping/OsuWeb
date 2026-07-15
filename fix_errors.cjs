const fs = require('fs');

let synth = fs.readFileSync('src/utils/audioSynth.ts', 'utf8');
synth = synth.replace(/duration: 10000/g, 'duration: 10000,\n      timingPoints: []');
fs.writeFileSync('src/utils/audioSynth.ts', synth);

let editor = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');
// move handleWheel before renderTimeline
editor = editor.replace(
  `  const [openMenu, setOpenMenu] = useState<string | null>(null);`,
  `  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const handleWheel = (e: React.WheelEvent) => {
    if (!isPlaying) {
       const delta = e.deltaY > 0 ? 100 : -100;
       const maxDur = audioRef.current?.duration ? audioRef.current.duration * 1000 : version.duration;
       const newTime = Math.max(0, Math.min(currentTime + delta, maxDur));
       setCurrentTime(newTime);
       if (audioRef.current) audioRef.current.currentTime = newTime / 1000;
       if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
    }
  };`
);
editor = editor.replace(/const handleWheel = \(e: React.WheelEvent\) => {[\s\S]*?};\n/, ''); // remove duplicate
fs.writeFileSync('src/components/BeatmapEditor.tsx', editor);

let selector = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');
selector = selector.replace(/onEditorToggle\(/g, 'onEditorToggleProp(');
selector = selector.replace(/onEditorToggle\)/g, 'onEditorToggleProp)');
fs.writeFileSync('src/components/BeatmapSelector.tsx', selector);


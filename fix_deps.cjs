const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');

// I will extract the mediaStateCode block and move it down.
// Wait, the block starts around line 32 and ends around 161.
const lines = code.split('\n');

const startIndex = lines.findIndex(l => l.includes('const [audioUrl, setAudioUrl]'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('window.removeEventListener(\'keydown\''));
// Actually, it ends right before `  const [currentTime`

// Let's just grab the whole block and move it after `const [dragOffset`
const beforeMedia = lines.slice(0, startIndex);
const mediaBlock = lines.slice(startIndex, endIndex + 2); // +2 to get the closing braces
const afterMedia = lines.slice(endIndex + 2);

// We want mediaBlock to go AFTER `const [activeComboColor, setActiveComboColor] = useState(0);`
const activeComboIdx = afterMedia.findIndex(l => l.includes('const [activeComboColor, setActiveComboColor]'));
const newBefore = afterMedia.slice(0, activeComboIdx + 1);
const newAfter = afterMedia.slice(activeComboIdx + 1);

const newLines = [...beforeMedia, ...newBefore, ...mediaBlock, ...newAfter];

fs.writeFileSync('src/components/BeatmapEditor.tsx', newLines.join('\n'));

let selector = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');
selector = selector.replace(/onEditorToggleProp/g, 'onEditorToggle');
fs.writeFileSync('src/components/BeatmapSelector.tsx', selector);

let synth = fs.readFileSync('src/utils/audioSynth.ts', 'utf8');
synth = synth.replace(/duration: 10000/g, 'duration: 10000,\n      timingPoints: []');
fs.writeFileSync('src/utils/audioSynth.ts', synth);


const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');
code = code.replace(
  `  setSelectedVersionIdx,
  onIntroEditorToggle,
}) => {`,
  `  setSelectedVersionIdx,
  onIntroEditorToggle,
  onEditorToggle,
}) => {`
);
fs.writeFileSync('src/components/BeatmapSelector.tsx', code);

let synth = fs.readFileSync('src/utils/audioSynth.ts', 'utf8');
synth = synth.replace(/duration: 10000/g, 'duration: 10000,\n      timingPoints: []');
fs.writeFileSync('src/utils/audioSynth.ts', synth);


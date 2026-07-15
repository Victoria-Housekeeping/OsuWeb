const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');

code = code.replace(
  `setSelectedVersionIdx
}) => {`,
  `setSelectedVersionIdx,
  onEditorToggle
}) => {`
);

// and fix audioSynth
let synthCode = fs.readFileSync('src/utils/audioSynth.ts', 'utf8');
synthCode = synthCode.replace(
  `duration: 10000
    }`,
  `duration: 10000,
      timingPoints: []
    }`
);
fs.writeFileSync('src/utils/audioSynth.ts', synthCode);
fs.writeFileSync('src/components/BeatmapSelector.tsx', code);

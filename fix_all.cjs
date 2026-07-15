const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');

code = code.replace(/onEditorToggleProp/g, 'onEditorToggle');

fs.writeFileSync('src/components/BeatmapSelector.tsx', code);


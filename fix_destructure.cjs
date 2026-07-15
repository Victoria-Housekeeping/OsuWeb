const fs = require('fs');
let code = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');

code = code.replace(
  `setSelectedVersionIdx,\n}: BeatmapSelectorProps`,
  `setSelectedVersionIdx,\n  onEditorToggleProp: onEditorToggle\n}: BeatmapSelectorProps`
);

fs.writeFileSync('src/components/BeatmapSelector.tsx', code);

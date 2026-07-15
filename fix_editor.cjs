const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');

code = code.replace(
`        type: 'circle',
        comboIndex: activeComboColor
      };`,
`        type: 'circle',
        comboIndex: hitObjects.filter(o => o.time < currentTime && o.comboSet === activeComboColor).length,
        comboSet: activeComboColor
      };`
);

code = code.replace(/obj\.comboIndex % comboColors\.length/g, "obj.comboSet % comboColors.length");

fs.writeFileSync('src/components/BeatmapEditor.tsx', code);

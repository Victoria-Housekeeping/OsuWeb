const fs = require('fs');
let appCode = fs.readFileSync('src/App.tsx', 'utf8');

appCode = appCode.replace(
  `const [isIntroEditorOpen, setIsIntroEditorOpen] = useState<boolean>(false);`,
  `const [isIntroEditorOpen, setIsIntroEditorOpen] = useState<boolean>(false);
  const [isBeatmapEditorOpen, setIsBeatmapEditorOpen] = useState<boolean>(false);`
);

appCode = appCode.replace(
  `// 3. If intro editor is open, stop any selection BGM to avoid overlapping with editor audio/video preview
    if (isIntroEditorOpen) {
      stopBgm();
      return;
    }`,
  `// 3. If intro editor or beatmap editor is open, stop any selection BGM
    if (isIntroEditorOpen || isBeatmapEditorOpen) {
      stopBgm();
      return;
    }`
);

appCode = appCode.replace(
  `}, [view, selectedGroupIdx, selectedVersionIdx, mapGroups, trianglesBuffer, settings.volume, isIntroEditorOpen]);`,
  `}, [view, selectedGroupIdx, selectedVersionIdx, mapGroups, trianglesBuffer, settings.volume, isIntroEditorOpen, isBeatmapEditorOpen]);`
);

appCode = appCode.replace(
  `setSelectedVersionIdx={setSelectedVersionIdx}`,
  `setSelectedVersionIdx={setSelectedVersionIdx}
          onEditorToggle={(isOpen) => setIsBeatmapEditorOpen(isOpen)}`
);

fs.writeFileSync('src/App.tsx', appCode);

let selectorCode = fs.readFileSync('src/components/BeatmapSelector.tsx', 'utf8');

selectorCode = selectorCode.replace(
  `setSelectedVersionIdx: React.Dispatch<React.SetStateAction<number>>;`,
  `setSelectedVersionIdx: React.Dispatch<React.SetStateAction<number>>;
  onEditorToggle?: (isOpen: boolean) => void;`
);

selectorCode = selectorCode.replace(
  `onClose={() => setShowBeatmapEditor(false)}`,
  `onClose={() => { setShowBeatmapEditor(false); if (onEditorToggle) onEditorToggle(false); }}`
);

selectorCode = selectorCode.replace(
  `onClick={() => setShowBeatmapEditor(true)}`,
  `onClick={() => { setShowBeatmapEditor(true); if (onEditorToggle) onEditorToggle(true); }}`
);

fs.writeFileSync('src/components/BeatmapSelector.tsx', selectorCode);

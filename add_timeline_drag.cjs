const fs = require('fs');

let code = fs.readFileSync('src/components/BeatmapEditor.tsx', 'utf8');

code = code.replace(
  `  const [isDragging, setIsDragging] = useState(false);`,
  `  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);`
);

code = code.replace(
  `  const handlePointerUp = () => {`,
  `  const handlePointerUp = () => {
    setIsDraggingTimeline(false);`
);

const pointerMoveLogic = `
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingTimeline && selectedIds.size > 0) {
      const deltaX = e.clientX - dragOffset.x;
      // viewWidthMs = 4000, timeline width is roughly window.innerWidth - 400 (just approximation)
      // let's just use a simple ratio: 100px = 500ms
      const deltaMs = deltaX * 5; 
      
      setHitObjects(prev => prev.map(obj => {
        if (selectedIds.has(obj.id)) {
          let newTime = obj.time + deltaMs;
          if (activeToggles.gridSnap && version.timingPoints) {
            const tps = version.timingPoints.filter(t => t.uninherited);
            const tp = tps.slice().reverse().find(t => t.time <= newTime) || tps[0];
            if (tp) {
               const snapMs = tp.beatLength / currentSnapDivisor;
               newTime = tp.time + Math.round((newTime - tp.time) / snapMs) * snapMs;
            }
          }
          return { ...obj, time: Math.max(0, newTime) };
        }
        return obj;
      }));
      setDragOffset({ x: e.clientX, y: e.clientY });
      return;
    }
`;

code = code.replace(
  `  const handlePointerMove = (e: React.PointerEvent) => {`,
  pointerMoveLogic
);

// update renderTimeline HitObjects to have onPointerDown
code = code.replace(
  `           return (
             <div key={obj.id} className="absolute top-1/2 -translate-y-1/2 w-2 h-8 rounded-full border bg-black/50"
                  style={{ left: \`calc(\${leftPerc}% - 4px)\`, borderColor: color }} />
           );`,
  `           return (
             <div key={obj.id} className="absolute top-1/2 -translate-y-1/2 w-2 h-8 rounded-full border bg-black/50 cursor-ew-resize"
                  style={{ left: \`calc(\${leftPerc}% - 4px)\`, borderColor: color }} 
                  onPointerDown={(e) => {
                     e.stopPropagation();
                     const newSelected = new Set(selectedIds);
                     if (!e.ctrlKey && !newSelected.has(obj.id)) {
                        newSelected.clear();
                        newSelected.add(obj.id);
                     } else if (e.ctrlKey) {
                        if (newSelected.has(obj.id)) newSelected.delete(obj.id);
                        else newSelected.add(obj.id);
                     }
                     setSelectedIds(newSelected);
                     setIsDraggingTimeline(true);
                     setDragOffset({ x: e.clientX, y: e.clientY });
                  }}
             />
           );`
);

fs.writeFileSync('src/components/BeatmapEditor.tsx', code);

const JSZip = require('jszip');
const fs = require('fs');
fs.readFile('-        # WhiteCat (1.0) 『CK』 #-.osk.zip', async (err, data) => {
  if (err) throw err;
  const zip = await JSZip.loadAsync(data);
  Object.keys(zip.files).filter(k => k.toLowerCase().includes('hit') || k.toLowerCase().includes('default')).forEach(k => console.log(k));
});

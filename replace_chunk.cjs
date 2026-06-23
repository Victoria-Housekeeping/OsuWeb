const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.tsx'));

files.forEach(f => {
  const filePath = path.join(srcDir, f);
  let cnt = fs.readFileSync(filePath, 'utf8');

  // Replace rounded borders, except rounded-full and rounded-none
  cnt = cnt.replace(/rounded-3xl/g, 'rounded-sm');
  cnt = cnt.replace(/rounded-2xl/g, 'rounded-sm');
  cnt = cnt.replace(/rounded-xl/g, 'rounded-sm');
  cnt = cnt.replace(/rounded-lg/g, 'rounded-sm');
  cnt = cnt.replace(/rounded-md/g, 'rounded-[2px]'); // slightly smaller
  cnt = cnt.replace(/rounded-t-xl/g, 'rounded-t-sm');

  // Less padding on some bigger elements to make it less chunky
  cnt = cnt.replace(/p-8/g, 'p-6');
  cnt = cnt.replace(/p-6/g, 'p-5');

  fs.writeFileSync(filePath, cnt);
  console.log(`Updated ${f}`);
});

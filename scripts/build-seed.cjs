const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
const cut = app.indexOf('const PREFS_KEY=');
if (cut < 0) throw new Error('Cannot locate catalog boundary');
let counter = 0;
const context = {
  crypto: {randomUUID() {
    const h = crypto.createHash('sha256').update(`frisbee-seed-${counter++}`).digest('hex').slice(0,32);
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'dist/catalog.js'), 'utf8') + '\n' + app.slice(0, cut) + '\nglobalThis.result=JSON.stringify(samples);', context);
const seeds = JSON.parse(context.result);
fs.writeFileSync(path.join(root, 'server/seed.json'), JSON.stringify(seeds, null, 2) + '\n');
console.log(`Built ${seeds.length} seed tactics`);

'use strict';
// Public read snapshots only. Editor sessions and credentials remain server-only.
const LibraryReadCache={
 key:'frisbee-shared-read-cache-v1',
 read(validate){try{const raw=localStorage.getItem(this.key);if(!raw||raw.length>2*1024*1024)return null;const data=JSON.parse(raw);if(data.format!==1||!Number.isInteger(data.revision)||data.revision<0||!Number.isFinite(data.saved)||Date.now()-data.saved>7*86400000||!Array.isArray(data.tactics)||data.tactics.length>500||!data.tactics.every(validate))return null;return data;}catch{return null;}},
 write(tactics,revision){try{const raw=JSON.stringify({format:1,saved:Date.now(),revision,tactics});if(raw.length<=2*1024*1024)localStorage.setItem(this.key,raw);}catch{} }
};
function staticAsset(path){const version=document.documentElement.dataset.assetsVersion;return /^[a-f0-9]{16}$/.test(version||'')?'assets/'+version+'/'+path:path;}

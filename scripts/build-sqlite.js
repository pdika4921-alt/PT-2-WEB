'use strict';

// Hostinger (dan host lain dengan glibc < 2.29) tidak bisa memakai
// prebuild better-sqlite3. Compile dari source saat build, lalu hapus
// prebuild Linux supaya binding.js memakai build/Release/better_sqlite3.node.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'linux') {
  console.log('Skipping better-sqlite3 source build (only needed on Linux hosts).');
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, '..');
const sqliteDir = path.join(projectRoot, 'node_modules', 'better-sqlite3');
const nodeGypBin = path.join(projectRoot, 'node_modules', '.bin', 'node-gyp');

if (!fs.existsSync(sqliteDir)) {
  console.log('better-sqlite3 not installed; skipping source build.');
  process.exit(0);
}

const result = spawnSync(nodeGypBin, ['rebuild', '--release'], {
  cwd: sqliteDir,
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}

const prebuildDir = path.join(sqliteDir, 'prebuilds');
for (const file of fs.readdirSync(prebuildDir)) {
  if (file.startsWith('linux')) {
    fs.rmSync(path.join(prebuildDir, file), { force: true });
  }
}

console.log('better-sqlite3 compiled from source; Linux prebuild removed.');

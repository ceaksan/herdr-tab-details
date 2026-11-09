import { copyFile, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let home = homedir();
let appHome;
let replace = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--replace') replace = true;
  else if (['--home', '--app-home'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
    const value = resolve(args[++i]);
    if (arg === '--home') home = value;
    else appHome = value;
  } else {
    throw new Error('Usage: node install.mjs [--app-home PATH] [--home HOME] [--replace]');
  }
}
const app = resolve(appHome || process.env.HERDR_APP_HOME ||
  join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'herdr-app'));
const keysPath = join(app, 'keys.json');
const beforeKeys = await readFile(keysPath, 'utf8');
const keys = JSON.parse(beforeKeys);
const binding = 'mod.open:herdr-info-palette';
if (!['app.palette', binding, undefined].includes(keys.global?.['cmd-shift-p'])) {
  throw new Error('Command+Shift+P has another binding. Merge keys.json manually. Nothing changed.');
}
if (!keys.global || typeof keys.global !== 'object' || Array.isArray(keys.global)) {
  throw new Error('Expected a global keybinding object. Nothing changed.');
}
keys.global['cmd-shift-p'] = binding;

const files = [];
for (const mod of ['herdr-info', 'herdr-info-palette']) {
  const names = mod === 'herdr-info-palette' ? ['main.js', 'mod.json', 'command.svg'] : ['main.js', 'mod.json'];
  for (const file of names) {
    files.push([join(app, 'mods', mod, file), await readFile(join(root, 'mods', mod, file), 'utf8')]);
  }
}
files.push([keysPath, JSON.stringify(keys, null, 2) + '\n']);

const changes = [];
for (const [path, content] of files) {
  const stat = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stat && !stat.isFile()) throw new Error('Refusing non-regular destination: ' + path);
  const before = stat ? await readFile(path, 'utf8') : null;
  if (before === content) continue;
  if (before !== null && path !== keysPath && !replace) {
    throw new Error('Existing mod differs: ' + path + '. Use --replace only after reviewing it. Nothing changed.');
  }
  changes.push({ path, content, before });
}
const stamp = Date.now();
for (const { path, content, before } of changes) {
  if (before !== null) {
    if (await readFile(path, 'utf8') !== before) throw new Error('File changed during installation: ' + path);
    const backup = path + '.before-herdr-info-' + stamp + '.bak';
    await copyFile(path, backup, constants.COPYFILE_EXCL);
    process.stdout.write('Backup: ' + backup + '\n');
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, before === null ? { encoding: 'utf8', flag: 'wx' } : 'utf8');
  if (await readFile(path, 'utf8') !== content) throw new Error('Verification failed: ' + path);
  process.stdout.write('Updated: ' + path + '\n');
}
process.stdout.write('Installed. Command+Shift+P > Tab details.\n');

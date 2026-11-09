import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const installEnv = { ...process.env, HERDR_APP_HOME: '', XDG_CONFIG_HOME: '' };
async function loadMod(name, herdr) {
  const context = vm.createContext({ localStorage: { getItem: () => null, setItem() {} } });
  const input = { on() {}, focus() {}, value: () => '' };
  const exports = {
    'gpui-kit': { View: class {}, div() {}, svg() {} },
    'gpui-base': { v_flex() {}, h_flex() {}, InputState: { new: () => input }, Input: {} },
    herdr,
  };
  const module = new vm.SourceTextModule(await readFile(join(root, 'mods', name, 'main.js'), 'utf8'), { context });
  await module.link((name) => {
    const values = exports[name];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
function fixture() {
  const state = {
    props: null,
    focus: { tab: 'tb1' },
    spaces: [{ id: 'sp1', name: 'Workspace', machine: null, tabs: [{ id: 'tb1', name: '1' }] }],
    panes: [{ pane: 'p1', tab: 'tb1', terminal: 't42', cwd: '/current', title: 'Agent', program: { name: 'Codex' } }],
    terminals: [{ address: 't42', cwd: '/launch', state: 'live' }],
    clipboard: [],
  };
  const api = {
    spaces: () => state.spaces, panes: () => state.panes, terminals: () => state.terminals,
    focused: () => state.focus, props: () => state.props, theme: () => ({}), closeOverlay() {},
  };
  const cx = { focus_handle: () => ({ focus() {} }), notify() {}, write_to_clipboard: (text) => state.clipboard.push(text) };
  return { state, api, cx };
}
test('actual mod init accepts null props and copy keeps its original tab after focus changes', async () => {
  const { state, api, cx } = fixture();
  const { default: Mod } = await loadMod('herdr-info', api);
  const view = new Mod();
  view.init(null, cx);
  state.focus = { tab: 'other' };
  view.copy(cx);
  assert.match(state.clipboard[0], /Tab ID: tb1/);
  assert.match(state.clipboard[0], /Terminal address: t42/);
  assert.match(state.clipboard[0], /Directory: \/current/);
  assert.match(state.clipboard[0], /Agent report: Not reported by Herdr/);
});
test('actual copy handler refuses stale tab details', async () => {
  const { state, api, cx } = fixture();
  const { default: Mod } = await loadMod('herdr-info', api);
  const view = new Mod();
  view.init(null, cx);
  state.spaces = [];
  view.copy(cx);
  assert.equal(state.clipboard.length, 0);
  assert.match(view.details().error, /closed or disconnected/);
});
test('explicit remote tab preserves qualified addresses, includes every pane and raw agent report', async () => {
  const { state, api, cx } = fixture();
  state.props = { tab: 'remote-demo/tb2' };
  state.spaces.push({ id: 'remote-demo/sp2', name: 'Remote', machine: 'remote-demo', tabs: [{ id: 'remote-demo/tb2', name: '2' }] });
  state.panes.push(
    { pane: 'remote-demo/p2', tab: 'remote-demo/tb2', terminal: 'remote-demo/t3', cwd: '/remote' },
    { pane: 'remote-demo/p3', tab: 'remote-demo/tb2', terminal: null, mod: 'notes' },
  );
  state.terminals.push({ address: 'remote-demo/t3', report: { app: 'claude-code', state: 'idle' } });
  const { default: Mod } = await loadMod('herdr-info', api);
  const view = new Mod();
  view.init(null, cx);
  view.copy(cx);
  const text = state.clipboard[0];
  assert.match(text, /hc get remote-demo\/t3 --json/);
  assert.match(text, /hc read remote-demo\/t3 --lines 50/);
  assert.match(text, /Pane 2: remote-demo\/p3/);
  assert.match(text, /Mod: notes/);
  assert.match(text, /"app":"claude-code"/);
  assert.doesNotMatch(text, /t42/);
});
test('palette search and selection invoke the native information mod', async () => {
  const calls = [];
  const api = {
    commands: () => [{ name: 'mod.open', args: [], about: '' }, { name: 'tab.new', args: [], about: '' }],
    layouts: () => [], keys: () => [], theme: () => ({}), shared: () => null,
    window: () => ({ platform: 'macos' }), props: () => ({ overlay: 'palette' }),
    closeOverlay: (id) => calls.push(['close', id]), openOverlay() {},
    run: (name, args) => calls.push([name, JSON.parse(JSON.stringify(args))]),
  };
  const { default: Palette } = await loadMod('herdr-info-palette', api);
  const view = new Palette();
  view.init(null, { timer: { after() {} }, focus_handle: () => ({}) });
  assert.ok(view.rows().some(({ e }) => e.title === 'New tab'));
  view.query = 'tab details';
  const entry = view.rows()[0].e;
  assert.equal(entry.title, 'Tab details');
  view.go(entry);
  assert.deepEqual(calls, [['close', 'palette'], ['mod.open', { name: 'herdr-info' }]]);
});
test('installer preserves unrelated config and never edits TUI settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'herdr-info-test-'));
  const app = join(home, '.config/herdr-app');
  const tui = join(home, '.config/herdr');
  await mkdir(app, { recursive: true });
  await mkdir(tui, { recursive: true });
  const keys = { global: { 'cmd-shift-p': 'app.palette', 'cmd-t': 'tab.new' }, terminal: { 'cmd-c': 'terminal.copy' } };
  const legacy = 'onboarding = false\n\n# BEGIN herdr-info\nkey = "prefix+i"\ncommand = "' + join(root, 'info.mjs') + '"\n# END herdr-info\n# keep this\n';
  await writeFile(join(app, 'keys.json'), JSON.stringify(keys));
  await writeFile(join(tui, 'config.toml'), legacy);
  const run = () => execFileSync(process.execPath, [join(root, 'install.mjs'), '--home', home], { encoding: 'utf8', env: installEnv });
  run();
  const actual = JSON.parse(await readFile(join(app, 'keys.json'), 'utf8'));
  assert.equal(actual.global['cmd-shift-p'], 'mod.open:herdr-info-palette');
  delete actual.global['cmd-shift-p'];
  delete keys.global['cmd-shift-p'];
  assert.deepEqual(actual, keys);
  assert.equal(await readFile(join(tui, 'config.toml'), 'utf8'), legacy);
  for (const name of ['herdr-info', 'herdr-info-palette']) {
    assert.equal(await readFile(join(app, 'mods', name, 'main.js'), 'utf8'), await readFile(join(root, 'mods', name, 'main.js'), 'utf8'));
  }
  const before = await readdir(app);
  run();
  assert.deepEqual(await readdir(app), before);
});

async function installFixture() {
  const home = await mkdtemp(join(tmpdir(), 'herdr-info-install-'));
  const app = join(home, 'app');
  await mkdir(app);
  const keysPath = join(app, 'keys.json');
  const originalKeys = '{"global":{"cmd-shift-p":"app.palette","cmd-t":"tab.new"}}\n';
  await writeFile(keysPath, originalKeys);
  const run = (extra = [], env = installEnv) => execFileSync(process.execPath,
    [join(root, 'install.mjs'), '--app-home', app, ...extra],
    { encoding: 'utf8', env, stdio: 'pipe' });
  return { home, app, keysPath, originalKeys, run };
}
test('installer refuses another shortcut before writing any mod', async () => {
  const f = await installFixture();
  const original = '{"global":{"cmd-shift-p":"custom.palette"}}\n';
  await writeFile(f.keysPath, original);
  assert.throws(() => f.run(), /another binding/);
  assert.equal(await readFile(f.keysPath, 'utf8'), original);
  assert.deepEqual(await readdir(f.app), ['keys.json']);
});
test('installer preflights all mod conflicts before any file changes', async () => {
  const f = await installFixture();
  const target = join(f.app, 'mods/herdr-info-palette');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'main.js'), '// existing customization\n');
  assert.throws(() => f.run(), /Existing mod differs/);
  assert.equal(await readFile(f.keysPath, 'utf8'), f.originalKeys);
  assert.deepEqual(await readdir(join(f.app, 'mods')), ['herdr-info-palette']);
  assert.equal(await readFile(join(target, 'main.js'), 'utf8'), '// existing customization\n');
});
test('explicit replacement backs up customized files and ships the icon', async () => {
  const f = await installFixture();
  const target = join(f.app, 'mods/herdr-info');
  await mkdir(target, { recursive: true });
  const customized = '// reviewed customization\n';
  await writeFile(join(target, 'main.js'), customized);
  f.run(['--replace']);
  const backup = (await readdir(target)).find((name) => name.endsWith('.bak'));
  assert.ok(backup);
  assert.equal(await readFile(join(target, backup), 'utf8'), customized);
  assert.equal(await readFile(join(f.app, 'mods/herdr-info-palette/command.svg'), 'utf8'),
    await readFile(join(root, 'mods/herdr-info-palette/command.svg'), 'utf8'));
});
test('environment app home is honored without touching the source checkout', async () => {
  const f = await installFixture();
  execFileSync(process.execPath, [join(root, 'install.mjs')], {
    encoding: 'utf8', env: { ...installEnv, HERDR_APP_HOME: f.app }, stdio: 'pipe',
  });
  assert.equal(JSON.parse(await readFile(f.keysPath, 'utf8')).global['cmd-shift-p'], 'mod.open:herdr-info-palette');
});

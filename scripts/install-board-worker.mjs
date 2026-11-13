import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = join(homedir(), '.config/epocar');
const venv = join(base, 'board-worker-venv');
await mkdir(base, { recursive: true, mode: 0o700 });
try { await access(join(venv, 'bin/python')); }
catch { execFileSync('python3', ['-m', 'venv', venv], { stdio: 'inherit' }); }
execFileSync(join(venv, 'bin/python'), ['-m', 'pip', 'install', '-r', join(root, 'scripts/requirements-board-worker.txt')], { stdio: 'inherit' });
const folder = join(homedir(), '.config/systemd/user');
await mkdir(folder, { recursive: true });
const quote = value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
const path = `${dirname(process.execPath)}:${join(homedir(), '.local/bin')}:/usr/local/bin:/usr/bin:/bin`;
await writeFile(join(folder, 'epocar-board-worker.service'), `[Unit]
Description=EpocarPC - routine personale verbali Codex
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${root.replaceAll('%', '%%')}
ExecStart=${quote(process.execPath)} ${quote(join(root, 'scripts/board-worker.mjs'))}
Environment=${quote(`PATH=${path}`)}
Restart=on-failure
RestartSec=15
UMask=0077

[Install]
WantedBy=default.target
`, { mode: 0o600 });
execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
execFileSync('systemctl', ['--user', 'enable', '--now', 'epocar-board-worker.service'], { stdio: 'inherit' });
execFileSync('systemctl', ['--user', 'is-active', '--quiet', 'epocar-board-worker.service']);
console.log('Routine EpocarPC installata. Completa il collegamento dal sito e importa il file con --configure.');

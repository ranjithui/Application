#!/usr/bin/env node
// Runs the API (watch mode) and the web dev server together, cross-platform.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['api', ['run', 'dev', '--workspace', 'backend']],
  ['web', ['run', 'dev', '--workspace', 'frontend']],
].map(([name, args]) => {
  const p = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on('data', tag);
  p.stderr.on('data', tag);
  p.on('exit', (code) => { console.log(`[${name}] exited (${code})`); shutdown(); });
  return p;
});
function shutdown() { procs.forEach((p) => p.exitCode === null && p.kill()); }
process.on('SIGINT', () => { shutdown(); process.exit(0); });

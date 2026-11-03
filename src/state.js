import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function loadState(file) {
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    return {
      cursor: Number.isInteger(json.cursor) && json.cursor >= 0 ? json.cursor : 0,
      sent: Array.isArray(json.sent) ? json.sent : [],
      pending: Array.isArray(json.pending) ? json.pending : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { cursor: 0, sent: [], pending: [] };
    throw new Error('Falha ao ler estado. Não enviaremos mensagens para evitar duplicações: ' + error.message);
  }
}

export async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true });
  const tempFile = file + '.' + randomUUID() + '.tmp';
  await writeFile(tempFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await rename(tempFile, file);
}

export function cleanState(state, now = Date.now()) {
  const days = 1000 * 60 * 60 * 24;
  state.sent = state.sent.filter(entry => now - Date.parse(entry.at) <= 100 * days);
  state.pending = state.pending.filter(entry => now - Date.parse(entry.at) <= days);
  return state;
}

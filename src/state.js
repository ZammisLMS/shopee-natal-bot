import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function loadState(file) {
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Formato inválido');
    return {
      cursor: Number.isInteger(json.cursor) && json.cursor >= 0 ? json.cursor : 0,
      cursors: json.cursors && typeof json.cursors === 'object' ? json.cursors : {},
      lastScans: json.lastScans && typeof json.lastScans === 'object' ? json.lastScans : {},
      sent: Array.isArray(json.sent) ? json.sent : [],
      pending: Array.isArray(json.pending) ? json.pending : [],
      events: Array.isArray(json.events) ? json.events : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { cursor: 0, cursors: {}, lastScans: {}, sent: [], pending: [], events: [] };
    }
    throw new Error('Falha ao ler estado. Envio bloqueado para evitar duplicações: ' + error.message);
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
  // Pendências são conservadas até investigação manual; no máximo 24h por compatibilidade.
  state.pending = state.pending.filter(entry => now - Date.parse(entry.at) <= days);
  state.events = (state.events || []).slice(-200);
  return state;
}

export function recordEvent(state, event) {
  state.events ||= [];
  state.events.push({ ...event, at: new Date().toISOString() });
  if (state.events.length > 200) state.events = state.events.slice(-200);
}

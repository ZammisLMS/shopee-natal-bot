import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function numberEnv(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(name + ' deve estar entre ' + min + ' e ' + max);
  }
  return value;
}

function readKeywords() {
  const keywords = JSON.parse(readFileSync(resolve('config/keywords.json'), 'utf8'));
  if (!Array.isArray(keywords) || keywords.length === 0 ||
      keywords.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('config/keywords.json precisa conter palavras-chave válidas');
  }
  return keywords.map(value => value.trim());
}

export function loadConfig() {
  const config = {
    shopeeAppId: process.env.SHOPEE_APP_ID?.trim() || '',
    shopeeAppSecret: process.env.SHOPEE_APP_SECRET?.trim() || '',
    sendEnabled: process.env.SEND_ENABLED === 'true',
    groupJid: process.env.WHATSAPP_GROUP_JID?.trim() || '',
    expectedGroupName: process.env.EXPECTED_GROUP_NAME?.trim() || '',
    maxPrice: numberEnv('MAX_PRICE_BRL', 100, 1, 100000),
    minDiscount: numberEnv('MIN_DISCOUNT_PCT', 30, 0, 100),
    minRating: numberEnv('MIN_RATING', 4.7, 0, 5),
    minSales: numberEnv('MIN_SALES', 50, 0, 100000000),
    minCommission: numberEnv('MIN_COMMISSION_PCT', 5, 0, 100),
    intervalMinutes: numberEnv('QUERY_INTERVAL_MINUTES', 30, 15, 1440),
    keywordsPerScan: numberEnv('KEYWORDS_PER_SCAN', 3, 1, 16),
    resultsPerQuery: numberEnv('RESULTS_PER_QUERY', 30, 1, 50),
    maxDailySends: numberEnv('MAX_DAILY_SENDS', 6, 1, 24),
    minPostGapMinutes: numberEnv('MIN_POST_GAP_MINUTES', 120, 10, 1440),
    repostCooldownDays: numberEnv('REPOST_COOLDOWN_DAYS', 7, 1, 90),
    sendStartHour: numberEnv('SEND_START_HOUR', 9, 0, 23),
    sendEndHour: numberEnv('SEND_END_HOUR', 21, 1, 24),
    timeZone: process.env.TIME_ZONE?.trim() || 'America/Sao_Paulo',
    sessionDir: process.env.SESSION_DIR?.trim() || './runtime/baileys',
    stateFile: process.env.STATE_FILE?.trim() || './runtime/state.json',
    logLevel: process.env.LOG_LEVEL?.trim() || 'info',
    keywords: readKeywords()
  };
  if (config.sendEndHour <= config.sendStartHour) {
    throw new Error('SEND_END_HOUR deve ser maior que SEND_START_HOUR');
  }
  if (config.sendEnabled &&
      (!/^[0-9-]+@g\.us$/.test(config.groupJid) || !config.expectedGroupName)) {
    throw new Error('Antes de ativar o envio, configure WHATSAPP_GROUP_JID e EXPECTED_GROUP_NAME');
  }
  new Intl.DateTimeFormat('pt-BR', { timeZone: config.timeZone }).format(new Date());
  return config;
}

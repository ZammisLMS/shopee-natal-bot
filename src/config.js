function numberEnv(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(name + ' deve estar entre ' + min + ' e ' + max);
  }
  return value;
}

export function loadConfig() {
  const config = {
    shopeeAppId: process.env.SHOPEE_APP_ID?.trim() || '',
    shopeeAppSecret: process.env.SHOPEE_APP_SECRET?.trim() || '',
    sendEnabled: process.env.SEND_ENABLED === 'true',
    keywordsPerScan: numberEnv('KEYWORDS_PER_SCAN', 3, 1, 16),
    resultsPerQuery: numberEnv('RESULTS_PER_QUERY', 30, 1, 50),
    timeZone: process.env.TIME_ZONE?.trim() || 'America/Sao_Paulo',
    sessionDir: process.env.SESSION_DIR?.trim() || './runtime/baileys',
    stateFile: process.env.STATE_FILE?.trim() || './runtime/state.json',
    groupsFile: process.env.GROUPS_FILE?.trim() || './runtime/groups.json',
    panelHost: process.env.PANEL_HOST?.trim() || '127.0.0.1',
    panelPort: numberEnv('PANEL_PORT', 8787, 1024, 65535),
    panelToken: process.env.PANEL_TOKEN?.trim() || '',
    logLevel: process.env.LOG_LEVEL?.trim() || 'info'
  };
  new Intl.DateTimeFormat('pt-BR', { timeZone: config.timeZone }).format(new Date());
  if (config.panelToken && config.panelToken.length < 32) {
    throw new Error('PANEL_TOKEN deve ter pelo menos 32 caracteres aleatórios');
  }
  if (!['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(config.panelHost)) {
    throw new Error('PANEL_HOST inválido');
  }
  if (config.panelHost === '0.0.0.0' && !process.env.CONTAINER_PANEL_BIND) {
    console.warn('ATENÇÃO: painel escutará interfaces públicas; proteja a porta com firewall e HTTPS.');
  }
  return config;
}

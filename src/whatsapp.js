import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

export async function connectWhatsApp(config, handlers) {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const socket = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false
  });
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', update => {
    if (update.qr) {
      console.log('Escaneie este QR Code no WhatsApp > Aparelhos conectados:');
      qrcode.generate(update.qr, { small: true });
    }
    if (update.connection === 'open') {
      console.log('WhatsApp conectado.');
      Promise.resolve(handlers.onReady(socket)).catch(error => console.error('Falha ao iniciar:', error.message));
    }
    if (update.connection === 'close') {
      handlers.onDisconnect?.();
      const code = update.lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('Sessão desconectada pelo WhatsApp. Faça novo pareamento manual.');
        return;
      }
      console.warn('Conexão caiu. Tentando reconectar em 5 segundos...');
      setTimeout(() => connectWhatsApp(config, handlers).catch(console.error), 5000);
    }
  });
  return socket;
}

export async function listGroups(socket) {
  const groups = await socket.groupFetchAllParticipating();
  const list = Object.values(groups).sort((a, b) => a.subject.localeCompare(b.subject));
  console.log('Grupos disponíveis para o número conectado:');
  for (const group of list) {
    console.log('- ' + group.subject + ' | ' + group.id + ' | ' + (group.participants?.length || 0) + ' participantes');
  }
  if (!list.length) console.log('Nenhum grupo encontrado. Adicione o número ao grupo primeiro.');
}

export async function validateGroup(socket, config) {
  const group = await socket.groupMetadata(config.groupJid);
  if (!group || group.id !== config.groupJid || group.subject.trim() !== config.expectedGroupName) {
    throw new Error('Grupo não confere com WHATSAPP_GROUP_JID e EXPECTED_GROUP_NAME. Envio bloqueado.');
  }
  return group;
}

export async function publishOffer(socket, config, offer, text) {
  await validateGroup(socket, config);
  const message = offer.imageUrl
    ? { image: { url: offer.imageUrl }, caption: text }
    : { text };
  return socket.sendMessage(config.groupJid, message);
}

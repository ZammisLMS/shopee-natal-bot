# Garimpo — bot de achadinhos por grupo (Shopee + WhatsApp)

Bot Node.js com **Shopee Affiliate GraphQL**, **Baileys** e **painel web** para até 20 grupos WhatsApp, cada um com seu próprio nicho, filtros e limites. Padrão de segurança: `SEND_ENABLED=false` e grupos desativados. Não envia nada até ser habilitado conscientemente.

## O que já funciona

- **Painel web** para cadastrar, configurar, testar, pausar e remover grupos.
- **Nichos independentes** (exemplos: Achadinhos de Natal e Achadinhos Fitness/Suplementos). Cada grupo tem palavras-chave, termos obrigatórios e excluídos, preço máximo, desconto, nota, vendas e comissão mínimos.
- **Agendamento por grupo:** intervalo de busca, limite de posts/dia, pausa entre publicações, janela de horário em São Paulo e proteção contra duplicatas por grupo.
- **Busca real pela API oficial de afiliados Shopee**; só usa URL de afiliado válida no WhatsApp; ranqueia candidatos por desconto, comissão, reputação e vendas.
- **WhatsApp via Baileys:** um único número entra em vários grupos; valida o JID e o nome exato do grupo antes de qualquer publicação, e usa o mesmo socket para todos.
- **Área de fontes** identifica quais conectores estão disponíveis e quais estão apenas planejados.
- **Histórico limitado** de envios, erros e simulações persistente no volume Docker.
- **Envio conservador:** `SEND_ENABLED=false` por padrão, intervalos por grupo, 3 minutos de guarda global, pendências para evitar repost em falhas incertas.

## Requisitos

- Node.js 22+, ou Docker + Compose (recomendado na VPS).
- Credenciais **Shopee Affiliate API (App ID / Secret)** e conta afiliada habilitada.
- Um número WhatsApp que participa de todos os grupos desejados.
- Cada grupo com nome cadastrado no painel **exatamente igual** ao assunto/nome do WhatsApp.
- VPS pequena (comece com **1 vCPU, 1 GB RAM**; 2 GB é mais confortável para logs/atualizações). Não precisa Chrome ou Puppeteer, pois Baileys usa WebSocket.
- Importante: Baileys é biblioteca não oficial. O uso para envios automáticos pode acarretar restrições na conta WhatsApp. Respeite consentimento dos membros, cadência moderada e regras da plataforma.

## Início rápido (VPS com Docker)

```bash
git clone https://github.com/ZammisLMS/shopee-natal-bot.git
cd shopee-natal-bot
cp .env.example .env
openssl rand -hex 32
```

Copie a saída do último comando para `PANEL_TOKEN` em `.env`. Insira também `SHOPEE_APP_ID` e `SHOPEE_APP_SECRET`. **Não poste credenciais em conversas ou issues.**

```bash
docker compose up -d --build
docker compose logs -f bot
```

Pareie o WhatsApp lendo o QR exibido nos logs (WhatsApp → Aparelhos conectados). Não ative os envios ainda.

Por segurança, o Docker expõe o painel só no **127.0.0.1 da VPS**, porta 8787. No computador pessoal, abra um túnel:

```bash
ssh -L 8787:127.0.0.1:8787 usuario@IP_DA_VPS
```

Abra **http://127.0.0.1:8787** no seu navegador e informe o token de administração. Se quiser acesso público mais tarde, configure HTTPS com autenticação e proxy reverso, sem liberar diretamente a porta 8787 da VPS.

## Como configurar grupos

1. Vá em **Grupos e parâmetros**. Há exemplos para Natal e Suplementos, ambos inicialmente pausados.
2. Clique **Configurar**. Informe o nome exato do grupo WhatsApp e o seu **JID** (formato `123456789-12345@g.us`). Para descobrir os JIDs, execute:
   ```bash
   docker compose stop bot
   docker compose run --rm bot node src/index.js --list-groups
   # Após copiar os JIDs, encerre o processo de listagem com Ctrl+C:
   docker compose up -d bot
   ```
   > Não execute dois processos Baileys simultaneamente com a mesma sessão.
3. Ajuste filtros, palavras-chave e horário por grupo.
4. Clique em **Testar busca**. É uma busca real na Shopee que **nunca envia mensagem**.
5. Ative o grupo no painel. Ele buscará periodicamente, mas continuará em **simulação** enquanto `SEND_ENABLED=false`.
6. Quando tudo estiver validado, altere `SEND_ENABLED=true` no `.env` e reinicie o serviço:
   ```bash
   docker compose up -d --force-recreate bot
   ```
   O bot só publica nos grupos marcados como ativos. **Cada publicação valida o JID e o nome do grupo**.

### Configurações gerais no .env

| Variável | Função |
|---|---|
| `SEND_ENABLED` | Trava geral de postagem; padrão `false` |
| `PANEL_TOKEN` | Token administrativo obrigatório, 32+ caracteres |
| `PANEL_HOST`, `PANEL_PORT` | Endereço/porta local, padrão 127.0.0.1:8787; Compose ajusta bind interno |
| `GROUPS_FILE` | Arquivo persistente de grupos, padrão `runtime/groups.json` |
| `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET` | Credenciais de afiliado |
| `KEYWORDS_PER_SCAN`, `RESULTS_PER_QUERY` | Máximo de buscas e resultados por rodada |
| `TIME_ZONE` | Fuso das janelas de publicação, padrão America/Sao_Paulo |

Os parâmetros individuais dos grupos ficam no painel e são persistidos em `GROUPS_FILE`. No Docker, os arquivos de sessão WhatsApp, grupos, histórico e estado são guardados no volume nomeado `bot_runtime`. **Faça backup do volume** antes de migrar ou reinstalar.

## Desenvolvimento local

```bash
npm install
cp .env.example .env
# Configure PANEL_TOKEN e credenciais
npm start
npm test
npm run check
npm run scan           # Testa todos os grupos sem mandar WhatsApp
npm run list-groups    # Lista JIDs com a sessão WhatsApp
```

Testes não precisam de credenciais. O painel usa HTTP nativo do Node, sem banco pesado e sem frontend build.

## Multi-fonte: roteiro

**Ativo hoje:** Shopee. As próximas integrações precisariam de contas autorizadas, credenciais e adaptadores para formatos e links de cada programa. No painel, fontes não integradas são explicitamente marcadas como planejadas ou em estudo, e não são selecionáveis para envio:

- **AliExpress:** APIs para consulta de produtos de afiliados e links.
- **Amazon:** Creators API, condicionada à elegibilidade do programa; a antiga PA-API está sendo descontinuada.
- **Awin:** Product Feeds/APIs para anunciantes e ofertas autorizadas.
- **Mercado Livre / Influenciador Magalu:** programas de afiliados existem, mas não foi confirmada API oficial de automação de links aplicável à conta.
- **TikTok Shop:** fluxos de afiliados e APIs sujeitos à disponibilidade e autorização.

Futuro: interface de conectores `searchOffers(provider, keyword)`, normalização por fonte, links com tags próprias e ranking comparável. **Não habilite provedores baseados em links manuais ou scraping sem avaliar seus termos**.

## Observações importantes

- Alterações no painel são persistidas automaticamente e aplicadas na próxima rodada; não requerem rebuild.
- Produto sem preço/desconto/comissão/avaliação válidos ou sem link Shopee autorizado é descartado. Os preços são informados pela API e podem mudar.
- Uma oferta publicada em um grupo pode ser publicada em outro (segmentação por grupo); no mesmo grupo, respeita o cooldown.
- Em falha de envio incerta, mantém registro pendente por até 24h para reduzir duplicatas. Antes de retomar, confira o grupo.
- O painel exige token Bearer; mantenha-o secreto e prefira SSH ou acesso HTTPS autenticado. Não há reset de senha nem usuários múltiplos neste MVP.
- `SEND_ENABLED=true` autoriza publicações automáticas sem revisão humana. Use apenas em grupos próprios e com autorização.

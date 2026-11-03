# Shopee Natal Bot 🎄

Bot de garimpo de ofertas **exclusivamente natalinas** na API oficial de afiliados Shopee, com seleção automática e publicação em um grupo de WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys).

> **Atenção:** Baileys é uma biblioteca não oficial baseada no WhatsApp Web. A automação pode contrariar políticas do WhatsApp e causar restrição ou banimento do número. Use apenas em grupo próprio, com membros que aceitaram receber promoções, e preferencialmente um número dedicado. O sistema não está afiliado à Shopee ou à Meta.

## Funcionalidades

- Pesquisa alternada por palavras-chave de Natal (arquivo config/keywords.json).
- Uso da API **de Afiliados** da Shopee (GraphQL assinada com App ID + Secret).
- Filtros de preço até R$ 100, desconto mínimo 30%, avaliação 4,7, 50 vendas e comissão de 5%.
- Relevância por desconto, comissão, avaliação e volume de vendas.
- Limite de 6 ofertas/dia, pelo menos 120 min entre publicações e janela 9h–21h no horário de São Paulo.
- Deduplicação por 7 dias e proteção de 24 horas para envios cujo resultado ficou incerto.
- Mensagem com foto (quando a Shopee fornece imagem HTTPS), preço e link **de afiliado**.
- Sessão do WhatsApp e estado persistentes, inclusive após reinício.
- Modo seguro: SEND_ENABLED=false por padrão.

## Requisitos

- Node.js 22+ (ou Docker).
- App ID e Secret com acesso à Open API de Afiliados da Shopee Brasil.
- Um número de WhatsApp adicionado ao grupo de achadinhos.
- VPS conectada à internet, com espaço persistente para a sessão.

## Instalação local / VPS

Execute no terminal:

    git clone https://github.com/ZammisLMS/shopee-natal-bot.git
    cd shopee-natal-bot
    npm install
    cp .env.example .env

1. Abra o arquivo .env no seu editor e preencha SHOPEE_APP_ID e SHOPEE_APP_SECRET.
2. Teste **sem enviar**: npm run scan. O comando só imprime uma oferta no terminal, se houver.
3. Faça o pareamento do número: npm run list-groups. Escaneie o QR em WhatsApp > Aparelhos conectados. O comando lista nome e JID de cada grupo e não publica mensagens.
4. Copie o JID correto para WHATSAPP_GROUP_JID e o nome idêntico para EXPECTED_GROUP_NAME.
5. Confirme que o número pertence ao grupo e que os participantes esperam receber ofertas.
6. Ative **somente depois** de conferir os dados: SEND_ENABLED=true no .env.
7. Inicie o serviço com npm start. O bot só envia se o grupo encontrado corresponder ao JID e nome esperados.

Se a Shopee não retornar ofertas que cumpram todos os filtros, o bot ficará em silêncio. Não há garantia de seis ofertas diárias.

## Rodar com Docker Compose

Após preencher .env, crie o diretório persistente e permita escrita ao usuário de dentro do container (UID 1000):

    mkdir -p runtime
    sudo chown 1000:1000 runtime
    docker compose up -d --build
    docker compose logs -f bot

O QR aparece nos logs se a sessão ainda não tiver sido vinculada. Para listar os grupos com o serviço parado:

    docker compose run --rm bot node src/index.js --list-groups

Atualizações:

    docker compose up -d --build

**Nunca publique** os arquivos .env ou runtime/ no Git. A pasta runtime/ contém chaves de sessão do WhatsApp. Mantenha backups privados, não exponha o serviço na internet e rode somente uma instância.

## Configuração

| Variável | Padrão | Efeito |
| --- | --- | --- |
| SEND_ENABLED | false | Bloqueia publicação até ativação explícita |
| WHATSAPP_GROUP_JID | vazio | Grupo destinatário, obtido com list-groups |
| EXPECTED_GROUP_NAME | vazio | Trava para prevenir envio ao grupo incorreto |
| MAX_PRICE_BRL | 100 | Preço máximo |
| MIN_DISCOUNT_PCT | 30 | Desconto anunciado mínimo |
| MIN_RATING | 4.7 | Nota mínima |
| MIN_SALES | 50 | Volume de vendas mínimo |
| MIN_COMMISSION_PCT | 5 | Comissão mínima |
| QUERY_INTERVAL_MINUTES | 30 | Frequência de buscas |
| KEYWORDS_PER_SCAN | 3 | Quantidade de temas pesquisados a cada ciclo |
| MAX_DAILY_SENDS | 6 | Teto de mensagens por dia |
| MIN_POST_GAP_MINUTES | 120 | Pausa mínima entre publicações |
| REPOST_COOLDOWN_DAYS | 7 | Bloqueio de repetição |
| SEND_START_HOUR / SEND_END_HOUR | 9 / 21 | Janela de envio (fim exclusivo) |
| TIME_ZONE | America/Sao_Paulo | Fuso dos limites |

Os filtros percentuais são aplicados **após** a busca da API, pois não são todos parâmetros diretos do endpoint. O campo priceDiscountRate é a taxa informada pela Shopee, **não prova** que o preço atual é o menor dos últimos meses. O projeto não inventa preço anterior nem cupom. Variações de frete, cupom, estoque e comissão podem alterar o valor final.

## Comandos

- npm run scan — busca única, sem WhatsApp e sem envio.
- npm run list-groups — pareia o número e lista grupos, sem envio.
- npm start — monitoramento contínuo; envia somente com SEND_ENABLED=true e grupo validado.
- npm test — testes do motor de seleção.
- npm run check — checagem sintática dos módulos.

## Segurança operacional

- Não registre App Secret ou token de sessão em logs.
- Um envio com confirmação incerta fica marcado como pendente por 24h para evitar retransmissão imediata.
- Não envie várias mensagens simultâneas; o motor limita a uma candidata por ciclo.
- Não use automação de adesão a grupos nem dispare mensagens a contatos individuais.
- Use grupo com adesão voluntária. Se houver denúncias ou restrições, desligue SEND_ENABLED.
- Não há estratégia de ocultação ou contorno dos mecanismos de detecção do WhatsApp.

## Escopo do MVP

Esta versão busca ofertas em páginas iniciais de palavras-chave, seleciona a melhor elegível por ciclo e publica somente em **um grupo**. Não inclui painel web, catálogo de histórico real de preços, validação de cupom/frete no checkout ou métricas de conversão. A execução real depende das credenciais e do pareamento, que não são fornecidos a este repositório.

# Barbearia do Lucas — agendamento online

Site onde os clientes agendam horário sozinhos:

1. escolhem o **serviço** (com preço e duração);
2. escolhem o **barbeiro** (ou "qualquer barbeiro");
3. veem só os **horários livres** do dia, já descontando almoço, folgas, horários passados e outros agendamentos;
4. informam nome e telefone e recebem a **confirmação na hora**, com código da reserva, botão "Adicionar à agenda" (.ics) e link para o WhatsApp da barbearia.

O cliente pode consultar e cancelar a reserva com o código + telefone. O Lucas tem um **painel** em `/admin` com a agenda do dia/semana, total previsto e botão de cancelar.

## Rodando

Requer Node.js 22 ou mais novo. Não há dependências para instalar.

```bash
ADMIN_PASSWORD=uma-senha-forte npm start
# abre em http://localhost:3000  (painel em http://localhost:3000/admin)
```

```bash
npm test
```

### Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `PORT` | Porta do servidor (padrão `3000`). |
| `ADMIN_PASSWORD` | Senha do painel `/admin`. Sem ela, o painel fica desativado. |
| `DATA_FILE` | Onde salvar os agendamentos (padrão `data/bookings.json`). |
| `SHOP_WHATSAPP` | WhatsApp da barbearia com DDI+DDD, só números (ex.: `5511999999999`). |
| `NOTIFY_WEBHOOK_URL` | URL que recebe um POST a cada agendamento/cancelamento (veja abaixo). |

## Personalizando

Tudo fica em [`src/config.js`](src/config.js): nome, endereço, horário de funcionamento por dia da semana (com intervalo de almoço), intervalo entre horários, antecedência mínima, quantos dias à frente dá para agendar, serviços (nome, preço, duração) e barbeiros (nome, descrição, dias em que trabalham).

### Visual

O layout segue uma identidade escura com detalhes dourados (fonte Poppins). As cores ficam como variáveis no topo de [`public/styles.css`](public/styles.css) (`--gold`, `--bg`, `--surface`...), então trocar a paleta é editar poucas linhas. Para usar fotos reais dos barbeiros, coloque as imagens em `public/img/` e preencha o campo `photo` de cada barbeiro em `src/config.js`; sem foto, aparecem as iniciais.

## Confirmação automática

Toda reserva já nasce **confirmada** — o horário só aparece se estiver livre, e a gravação é feita de forma atômica, então dois clientes não conseguem pegar o mesmo horário. O cliente vê a confirmação na tela na hora.

Para também mandar a confirmação por **WhatsApp, SMS ou e-mail**, configure `NOTIFY_WEBHOOK_URL`. O servidor envia:

```json
{
  "event": "booking.confirmed",
  "booking": { "code": "K7M2QX", "name": "João", "phone": "11987654321", "email": "", "serviceName": "Corte", "barberName": "Lucas", "date": "2026-10-28", "time": "14:00", "...": "..." },
  "message": "Olá, João! Seu horário na Barbearia do Lucas está confirmado.\n..."
}
```

Também há `booking.cancelled` quando uma reserva é cancelada. Basta ligar esse webhook a um Zapier, Make, n8n ou à API do WhatsApp Business/provedor de e-mail e repassar `message` para `booking.phone`/`booking.email`. Sem o webhook, a mensagem é escrita no log do servidor.

## Estrutura

```
server.js            inicia o servidor HTTP
src/config.js        serviços, barbeiros e horários
src/availability.js  cálculo dos horários livres
src/bookings.js      regras de agendamento e cancelamento
src/notify.js        mensagens, link do WhatsApp, arquivo .ics, webhook
src/store.js         persistência em arquivo JSON
src/app.js           rotas da API e arquivos estáticos
public/              site (index.html) e painel (admin.html)
test/                testes (node:test)
```

### API

| Método | Rota | |
| --- | --- | --- |
| GET | `/api/info` | serviços, barbeiros, horário de funcionamento |
| GET | `/api/availability?date=&serviceId=&barberId=` | horários livres |
| POST | `/api/bookings` | cria reserva `{serviceId, barberId, date, time, name, phone, email?}` |
| GET | `/api/bookings/:codigo` | consulta reserva |
| GET | `/api/bookings/:codigo.ics` | arquivo para a agenda do celular |
| POST | `/api/bookings/:codigo/cancel` | cancela `{phone}` |
| GET | `/api/admin/bookings?from=&to=` | agenda (cabeçalho `Authorization: Bearer <ADMIN_PASSWORD>`) |
| POST | `/api/admin/bookings/:codigo/cancel` | cancelamento pelo painel |

## Publicando

Funciona em qualquer hospedagem que rode Node (Render, Railway, Fly.io, uma VPS...). Como os dados ficam em arquivo, use um disco persistente e aponte `DATA_FILE` para ele. Rode uma única instância do servidor.

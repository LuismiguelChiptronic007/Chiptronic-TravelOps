# Chiptronic TravelOps

Sistema interno de controle de viagens corporativas.

## Stack (sem React / sem Python)

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML + CSS + JavaScript (vanilla) |
| Backend | Cloudflare Workers + [Hono](https://hono.dev) |
| Banco | **Cloudflare D1** (SQLite na nuvem) |
| Arquivos | **Cloudflare R2** (comprovantes, anexos, avatares) |
| Auth | JWT (HMAC-SHA256) + senha PBKDF2 via Web Crypto |

## MVP incluído

1. Cadastro e login (+ esqueci minha senha)
2. Criação e listagem de viagens
3. Checklist obrigatório de encerramento
4. Dashboard com status e cards
5. Perfil com histórico e estatísticas
6. Upload de despesas (comprovante) e anexos no R2

**Fora do MVP:** painel gestor, export Excel/PDF, e-mail automático.

## Pré-requisitos

- Node.js 18+
- Conta Cloudflare
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i` já instala)

## Setup local

```bash
cd "c:\xampp\htdocs\Chiptronic TravelOps"
npm install

# Aplica migration no D1 local
npx wrangler d1 migrations apply travelops-db --local

# Sobe API + frontend em http://127.0.0.1:8787
npm run dev
```

Abra `http://127.0.0.1:8787` → cadastre um usuário → use o sistema.

O segredo JWT de desenvolvimento está em `.dev.vars`.

## Deploy na Cloudflare

```bash
# 1) Criar banco D1 e copiar o database_id para wrangler.toml
npx wrangler d1 create travelops-db

# 2) Criar bucket R2
npx wrangler r2 bucket create travelops-files

# 3) Migration remota
npx wrangler d1 migrations apply travelops-db --remote

# 4) Segredo de produção
npx wrangler secret put JWT_SECRET

# 5) Deploy
npm run deploy
```

Edite `wrangler.toml` e substitua `database_id = "local-dev-placeholder"` pelo ID real retornado no passo 1.

## Status das viagens

| Status | Cor | Regra |
|--------|-----|--------|
| Planejada | Cinza | `start_date` no futuro |
| Em andamento | Azul | Hoje entre início e fim |
| Aguardando relatório | Amarelo | Viagem terminou; checklist incompleto |
| Concluída | Verde | Checklist obrigatório preenchido + botão concluir |

Campos obrigatórios do checklist: objetivo (sim/não), pessoas visitadas, atividades, pendências.

## Estrutura

```
├── Frontend/          # HTML/CSS/JS estático
├── src/               # Worker (Hono)
│   ├── index.js
│   ├── auth.js
│   ├── trips.js
│   ├── checklist.js
│   ├── files.js
│   ├── profile.js
│   └── ...
├── migrations/        # SQL D1
├── wrangler.toml
└── package.json
```

## API (resumo)

- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/trips/dashboard` · `GET|POST /api/trips` · `GET|PUT /api/trips/:id`
- `PUT /api/trips/:id/checklist` · `POST /api/trips/:id/complete`
- `POST /api/trips/:id/expenses` · `POST /api/trips/:id/attachments`
- `GET /api/profile` · `PUT /api/profile` · `POST /api/profile/avatar`
- `GET /api/files/*` — serve objetos do R2

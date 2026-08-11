# Deploy — Chiptronic TravelOps (Cloudflare Workers + D1)

Este documento descreve os passos para publicar o backend (Worker que serve assets + API) e preparar o frontend para produção.

Pré-requisitos
- Node.js + npm
- Wrangler (Cloudflare CLI) instalado: `npm install -g wrangler`
- Conta Cloudflare com permissões para Workers e D1
- Projeto já contém `wrangler.toml` e `[[d1_databases]]` configurado

1) Autenticar no Cloudflare
```powershell
wrangler login
wrangler whoami
```
Siga as instruções no browser para autorizar.

2) Verificar `wrangler.toml`
- `name` do worker está correto
- `assets.directory` aponta para `./Frontend` (para servir a UI)
- `run_worker_first = ["/api/*"]` está presente (faz o Worker tratar /api/* antes dos assets)
- `[[d1_databases]]` contém `binding` e `database_id` do seu D1
- Se desejar, adicione `account_id = "<SEU_ACCOUNT_ID>"`

3) Criar/executar migrations (D1)
```powershell
npm run db:remote:all
```
Isso executa os scripts em `migrations/` na sua instância D1 remota. Verifique no painel Cloudflare → D1 → seu DB.

4) Deploy do Worker (assets + API)
```powershell
npm run deploy
```
O output exibirá a URL pública do worker (ex.: https://chiptronic-travelops.<workers.dev>). Acesse essa URL — a UI será servida.

5) Testes e logs
- Após deploy, teste criar/login/viagem/tarefas e verificar notificações.
- Para ver logs em tempo real:
```powershell
wrangler tail --since 1m
```

6) Sem R2
- Se você NÃO quer usar R2, mantenha as linhas `r2_buckets` comentadas em `wrangler.toml`.
- Endpoints que tentarem upload (tarefas com fotos, avatar) verificarão `hasFileStorage` e retornarão 503 se R2 não estiver configurado. Isso é tratável no frontend.

7) Domínio próprio (opcional)
- Siga docs Cloudflare Workers para atribuir domínio customizado se desejar.

Problemas comuns
- Erro: `account_id` não encontrado → rode `wrangler whoami` e adicione `account_id` em `wrangler.toml`.
- Migrations não aplicam → verifique `database_id` em `wrangler.toml` corresponde ao DB no painel Cloudflare.
- UI carrega mas API retorna 404/401 → confirme token JWT e CORS; se usar `API_BASE` relativo, o Worker servirá `/api` corretamente.

Se quiser, eu posso:
- Gerar um `wrangler publish` com variáveis de ambiente para produção (ex.: secrets em Cloudflare) — diga quais envs precisa.
- Ajustar o frontend para exibir mensagens de erro de upload quando R2 não estiver presente.

# Patrickadas-Back

API NestJS do Patrickadas. O endpoint de login é `POST /v1/auth/login`.

## Saúde da API

`GET /health` e `GET /v1/health` são públicos e retornam HTTP 200 com
`Content-Type: application/json` e corpo `{"status":"ok"}`. Não consultam
Supabase, banco ou serviços externos. Indicam que a API inicializou e está
respondendo; não verificam a disponibilidade do banco. As outras rotas
continuam sob `/v1`. A inicialização mantém as variáveis exigidas pelos
módulos existentes.

Essas rotas exigem que a hospedagem encaminhe as requisições à aplicação.
Um `NOT_FOUND` da própria Vercel precisa ser resolvido na publicação, além
da implementação do endpoint.

## Publicação na Vercel

`vercel.json` seleciona o suporte nativo `nestjs`. A Vercel reconhece
`src/main.ts` como entrada e empacota a aplicação como uma Vercel Function.
Não configurar o backend como site estático nem encaminhar as requisições
para um arquivo `dist/main.js` com o builder legado.

Essa escolha foi autorizada explicitamente pelo responsável no chat em
20/10/2026, como exceção à restrição de configuração de deploy e à previsão
de adapter manual no ADR-001 §3. O ADR deve ser atualizado pelo time.

Referência: https://vercel.com/docs/frameworks/backend/nestjs.
Após integrar o PR e concluir o deploy, conferir `GET /health` na URL de
produção: HTTP 200, JSON `{"status":"ok"}`. Um deploy marcado como concluído
não substitui essa verificação HTTP. URLs de preview podem exigir login
por causa da proteção de deployments da Vercel.

## Verificação local

Instale as dependências com `npm ci`. Configure o `.env` a partir de
`.env.example`, com `SUPABASE_URL` e a chave de serviço do Supabase local.
Não use o projeto remoto para testes.

Na raiz do repositório de documentação/banco, inicie o Docker e o Supabase
local. Os usuários de desenvolvimento e seus memberships devem existir;
o procedimento atual está em `supabase/seed.sql` nesse repositório.

No diretório da API:

```sh
npm test
npm run build
```

`npm test` compila o backend e executa Jest com supertest. Os testes em
`test/auth.test.cjs` usam clientes simulados para reproduzir concorrência
e detectar compartilhamento de sessão. Os testes em `test/auth.local.test.cjs`
usam Supabase local real, verificam status e corpo do endpoint e conferem
o bloqueio de leitura do membership de outro usuário via RLS. A suíte recusa
uma `SUPABASE_URL` remota antes de criar a aplicação.

Os testes não criam usuários nem alteram schema ou dados. Se o banco for
resetado, será necessário recriar os usuários locais conforme o procedimento
do seed antes de executar a suíte. Credenciais de desenvolvimento:
`colaborador@teste.local` / `colaborador123` e
`operacoes@teste.local` / `operacoes123`.

Os comandos de build e teste chamam os arquivos JavaScript das ferramentas
diretamente para evitar falhas dos wrappers `.cmd` em caminhos Windows com `&`.

# Patrickadas-Back

API NestJS do Patrickadas. O endpoint de login é `POST /v1/auth/login`.

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

require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { GenericContainer, Wait } = require('testcontainers');
const { PrismaClient } = require('@prisma/client');
const { LoansService } = require('../dist/modules/loans/loans.service');
const { accessContext, createAbility } = require('../dist/modules/auth/access-context');

const run = process.env.PATRICKADAS_TESTCONTAINERS === '1' ? test : test.skip;
run('test_ca_005_06_ca_005_12_testcontainers_migrations_concorrencia_e_limite', async () => {
  let container;
  let db;
  try {
    container = await new GenericContainer('public.ecr.aws/supabase/postgres:17.6.1.171')
      .withEntrypoint(['docker-entrypoint.sh']).withCommand(['postgres', '-c', 'listen_addresses=*'])
      .withEnvironment({ POSTGRES_PASSWORD: 'fixture-container-only', POSTGRES_DB: 'postgres' })
      .withExposedPorts(5432).withWaitStrategy(Wait.forListeningPorts()).withStartupTimeout(120000).start();
    if (!['localhost', '127.0.0.1', '::1'].includes(container.getHost())) throw Error('Container não local');
    const sql = async text => {
      const result = await container.exec(['psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-c', text]);
      if (result.exitCode !== 0) throw Error(result.stderr || result.stdout);
    };
    // Minimal Auth/Storage interfaces supplied by Supabase in the full CLI stack.
    // Application tables, policies, constraints and triggers come from the actual migrations.
    await sql(`alter role supabase_admin password 'fixture-container-only';
      do $$ begin
      if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      if not exists(select from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin; end if;
      end $$;
      create schema if not exists auth; create schema if not exists storage;
      create table if not exists auth.users(id uuid primary key);
      create or replace function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create or replace function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create table if not exists storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[]);
      grant usage on schema public,auth to authenticated;
      alter default privileges in schema public grant select on tables to authenticated;`);
    const directory = path.resolve(__dirname, '../../supabase/migrations');
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      await sql(fs.readFileSync(path.join(directory, file), 'utf8'));
    }
    db = new PrismaClient({ datasources: { db: { url: `postgresql://supabase_admin:fixture-container-only@127.0.0.1:${container.getMappedPort(5432)}/postgres` } } });
    const tenantId = randomUUID(), userId = randomUUID();
    await db.tenant.create({ data: { id: tenantId, slug: 'container-fixture', name: 'Fixture' } });
    await db.$executeRaw`insert into auth.users(id) values (${userId}::uuid)`;
    await db.membership.create({ data: { userId, tenantId, role: 'colaborador' } });
    const member = { userId, tenantId, role: 'colaborador' };
    const asUser = callback => accessContext.run({ ...member, ability: createAbility(member) }, callback);
    const loans = new LoansService(db, { displayName: async () => 'Fixture' });
    const items = await Promise.all([1,2,3,4].map(index => db.equipment.create({ data: {
      tenantId, nome: `Monitor ${index}`, patrimonio: `TC-${index}`, categoria: 'monitor', situacao: 'disponivel',
    } })));
    const sameItem = await Promise.allSettled([1,2].map(() => asUser(() => loans.create(items[0].id))));
    expect(sameItem.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(sameItem.find(result => result.status === 'rejected').reason.status).toBe(409);
    const limited = await Promise.allSettled(items.slice(1).map(item => asUser(() => loans.create(item.id))));
    expect(limited.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(limited.find(result => result.status === 'rejected').reason.code).toBe('loan_limit');
    expect(await db.loan.count({ where: { tenantId, returnedAt: null } })).toBe(3);
    expect(await db.auditEvent.count({ where: { tenantId, action: 'loan.created' } })).toBe(3);
    const active = await db.loan.findMany({ where: { tenantId } });
    const first = await asUser(() => loans.returnItem(active[0].id));
    expect(first.changed).toBe(true);
    expect((await asUser(() => loans.returnItem(active[0].id))).changed).toBe(false);
    expect(await db.auditEvent.count({ where: { tenantId, action: 'loan.returned' } })).toBe(1);
  } finally {
    if (db) await db.$disconnect();
    if (container) await container.stop();
  }
}, 180000);

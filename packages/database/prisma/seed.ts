/**
 * Seed the roles and agent registry MOLIDO AI needs to boot.
 *
 * Deliberately does NOT create users. No fake accounts, no demo traffic, no
 * synthetic activity — the dashboard starts at zero and only real usage moves
 * it. A Founder account is created explicitly, from real credentials supplied
 * through the environment:
 *
 *     FOUNDER_EMAIL=you@example.com FOUNDER_PASSWORD='...' pnpm db:seed
 */

import { AiAgentType, PrismaClient, RoleName } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_DESCRIPTIONS, PERMISSIONS } from '@molido/types';
import { ScryptPasswordHasher, isValidEmail, normalizeEmail, validatePassword } from '@molido/security';

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  FOUNDER: 'Ultimate authority. Approves high-risk actions and can halt the system.',
  ADMIN: 'Operational administration: users, sessions, AI oversight, audit review.',
  USER: 'Standard account. Can create and read its own AI tasks.',
  AI_AGENT: 'Non-human actor. Operates only inside an orchestrated task.',
  SERVICE: 'Machine-to-machine integration with a narrow, explicit grant.',
};

const AGENTS = [
  {
    key: 'research',
    name: 'Research Agent',
    description:
      'Plans and carries out research requests, returns structured findings, states what it is uncertain about and never invents a source.',
    type: AiAgentType.RESEARCH,
    // The narrowest grant that still lets the agent do its job. No filesystem,
    // no shell, no database writes, no credentials, no financial authority.
    permissions: ['AI_TASK_READ'],
    configuration: { temperature: 0.2, maxOutputTokens: 2000, promptVersion: 1 },
    maxTokensPerTask: 8000,
    maxTasksPerHour: 30,
    requiresApproval: false,
  },
];

async function seedPermissions(): Promise<void> {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code] },
    });
  }
  console.log(`  permissions: ${PERMISSIONS.length} registered`);
}

async function seedRoles(): Promise<void> {
  const permissionIdByCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((permission) => [
      permission.code,
      permission.id,
    ]),
  );

  for (const name of Object.values(RoleName)) {
    const codes = [...(DEFAULT_ROLE_PERMISSIONS[name] ?? [])];

    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    });

    // Grants are reconciled, not merely added: a permission removed from the
    // defaults in code is revoked in the database on the next seed. A stale
    // grant is exactly how least privilege quietly erodes.
    const desiredIds = new Set(
      codes.map((code) => permissionIdByCode.get(code)).filter((id): id is string => Boolean(id)),
    );

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: [...desiredIds] } },
    });

    for (const permissionId of desiredIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }

    console.log(`  role ${name.padEnd(8)} → ${desiredIds.size} permissions`);
  }
}

async function seedAgents(): Promise<void> {
  for (const agent of AGENTS) {
    await prisma.aiAgent.upsert({
      where: { key: agent.key },
      update: {
        name: agent.name,
        description: agent.description,
        type: agent.type,
        configuration: agent.configuration,
        permissions: agent.permissions,
        maxTokensPerTask: agent.maxTokensPerTask,
        maxTasksPerHour: agent.maxTasksPerHour,
        requiresApproval: agent.requiresApproval,
      },
      create: agent,
    });
    console.log(`  agent ${agent.key} registered (${agent.permissions.length} permissions)`);
  }
}

async function seedFounder(): Promise<void> {
  const email = process.env['FOUNDER_EMAIL'];
  const password = process.env['FOUNDER_PASSWORD'];

  if (!email || !password) {
    console.log('  founder: skipped (set FOUNDER_EMAIL and FOUNDER_PASSWORD to create one)');
    return;
  }

  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error('FOUNDER_EMAIL is not a valid email address');
  }
  const policy = validatePassword(password, { email: normalized });
  if (!policy.valid) {
    throw new Error(`FOUNDER_PASSWORD rejected: ${policy.errors.join('; ')}`);
  }

  const founderRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.FOUNDER } });
  const passwordHash = await new ScryptPasswordHasher().hash(password);

  const user = await prisma.user.upsert({
    where: { email: normalized },
    // An existing password is never silently overwritten by a re-seed.
    update: {},
    create: { email: normalized, passwordHash, displayName: 'Founder', emailVerifiedAt: new Date() },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: founderRole.id } },
    update: {},
    create: { userId: user.id, roleId: founderRole.id },
  });

  console.log(`  founder: ${normalized} ready`);
}

async function main(): Promise<void> {
  console.log('MOLIDO AI — seeding baseline data');
  await seedPermissions();
  await seedRoles();
  await seedAgents();
  await seedFounder();

  const [users, tasks] = await Promise.all([prisma.user.count(), prisma.aiTask.count()]);
  console.log(`Done. users=${users} aiTasks=${tasks} (zero is the correct starting point)`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

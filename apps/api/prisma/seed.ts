import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient, AgentRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AUTH, SESSION_LIMITS } from '@oracle/shared';
import { DIRECTOR_PROMPT } from '@core/prompts/defaults/director.prompt';
import { ANALYST_CLAUDE_PROMPT } from '@core/prompts/defaults/analyst-claude.prompt';
import { ANALYST_GPT_PROMPT } from '@core/prompts/defaults/analyst-gpt.prompt';
import { ANALYST_GEMINI_PROMPT } from '@core/prompts/defaults/analyst-gemini.prompt';
import { RESEARCHER_PROMPT } from '@core/prompts/defaults/researcher.prompt';

const prisma = new PrismaClient();

const DEFAULT_DIRECTOR_MODEL_ID = 'anthropic/claude-sonnet-4-6';
const DEFAULT_RESEARCHER_MODEL_ID = 'sonar-reasoning-pro';

async function main(): Promise<void> {
  console.log('🌱 Запуск seed...');

  await seedAdmin();
  await seedSettings();
  await seedDefaultPrompts();

  console.log('✅ Seed завершён');
}

/** Создание администратора */
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@besales.app';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';
  const name = 'Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ⏭  Админ уже существует: ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, AUTH.BCRYPT_SALT_ROUNDS);
  await prisma.user.create({ data: { email, password: hashed, name } });
  console.log(`  ✅ Админ создан: ${email}`);
}

/** Дефолтные настройки (API-ключи пустые, лимиты из констант) */
async function seedSettings(): Promise<void> {
  const defaults: { key: string; value: string }[] = [
    { key: 'openrouter_api_key', value: '' },
    { key: 'perplexity_api_key', value: '' },
    { key: 'anthropic_api_key', value: '' },
    { key: 'openai_api_key', value: '' },
    { key: 'google_api_key', value: '' },
    { key: 'serper_api_key', value: '' },
    { key: 'default_max_rounds', value: String(SESSION_LIMITS.DEFAULT_MAX_ROUNDS) },
    { key: 'default_analyst_count', value: String(SESSION_LIMITS.DEFAULT_ANALYSTS) },
    { key: 'default_director_model', value: DEFAULT_DIRECTOR_MODEL_ID },
    { key: 'default_researcher_model', value: DEFAULT_RESEARCHER_MODEL_ID },
  ];

  for (const { key, value } of defaults) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log('  ✅ Настройки проинициализированы');
}

/** Дефолтные промпт-шаблоны для каждой роли + модели */
async function seedDefaultPrompts(): Promise<void> {
  const prompts: {
    role: AgentRole;
    modelId: string | null;
    name: string;
    content: string;
  }[] = [
    {
      role: AgentRole.DIRECTOR,
      modelId: null,
      name: 'Директор — универсальный',
      content: DIRECTOR_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: null,
      name: 'Аналитик — универсальный (Claude)',
      content: ANALYST_CLAUDE_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'anthropic/claude-sonnet-4-6',
      name: 'Аналитик — Claude Sonnet 4.6',
      content: ANALYST_CLAUDE_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'anthropic/claude-opus-4-6',
      name: 'Аналитик — Claude Opus 4.6',
      content: ANALYST_CLAUDE_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'openai/gpt-5.2-thinking',
      name: 'Аналитик — GPT-5.2 Thinking',
      content: ANALYST_GPT_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'openai/gpt-5.3-codex',
      name: 'Аналитик — GPT-5.3 Codex',
      content: ANALYST_GPT_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'openai/gpt-5.3-chat',
      name: 'Аналитик — GPT-5.3 Chat',
      content: ANALYST_GPT_PROMPT,
    },
    {
      role: AgentRole.ANALYST,
      modelId: 'google/gemini-3.1-pro',
      name: 'Аналитик — Gemini 3.1 Pro',
      content: ANALYST_GEMINI_PROMPT,
    },
    {
      role: AgentRole.RESEARCHER,
      modelId: null,
      name: 'Ресерчер — универсальный',
      content: RESEARCHER_PROMPT,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    const existing = await prisma.promptTemplate.findFirst({
      where: { role: prompt.role, modelId: prompt.modelId, isDefault: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.promptTemplate.create({
      data: { ...prompt, isDefault: true },
    });
    created++;
  }

  console.log(`  ✅ Промпты: ${created} создано, ${skipped} уже существуют`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

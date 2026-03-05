import { SettingsService } from '@settings/settings.service';
import type { PrismaService } from '@prisma/prisma.service';

type SettingsRecord = { key: string; value: string };

describe('SettingsService', () => {
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalDefaultMaxRounds = process.env.DEFAULT_MAX_ROUNDS;

  let prisma: {
    setting: {
      findMany: jest.Mock<Promise<SettingsRecord[]>, []>;
      upsert: jest.Mock<Promise<void>, [unknown]>;
    };
  };
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      setting: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    service = new SettingsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    process.env.DEFAULT_MAX_ROUNDS = originalDefaultMaxRounds;
  });

  it('должен fallback на env если в кэше пустое значение', async () => {
    prisma.setting.findMany.mockResolvedValue([{ key: 'openrouter_api_key', value: '' }]);
    process.env.OPENROUTER_API_KEY = 'sk-or-env-key';

    await service.onModuleInit();

    expect(service.get('openrouter_api_key')).toBe('sk-or-env-key');
  });

  it('getAll должен брать env для известных ключей, если в БД пусто', async () => {
    prisma.setting.findMany.mockResolvedValue([
      { key: 'openrouter_api_key', value: '' },
      { key: 'default_max_rounds', value: '' },
    ]);
    process.env.OPENROUTER_API_KEY = 'sk-or-env-key';
    process.env.DEFAULT_MAX_ROUNDS = '7';

    await service.onModuleInit();

    await expect(service.getAll()).resolves.toMatchObject({
      openrouter_api_key: 'sk-or-env-key',
      default_max_rounds: '7',
    });
  });

  it('set должен trim-ить значение перед сохранением', async () => {
    await service.set('openrouter_api_key', '  sk-or-manual-key  ');

    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'openrouter_api_key' },
      update: { value: 'sk-or-manual-key' },
      create: { key: 'openrouter_api_key', value: 'sk-or-manual-key' },
    });
    expect(service.get('openrouter_api_key')).toBe('sk-or-manual-key');
  });
});

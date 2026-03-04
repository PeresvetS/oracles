import { Test, TestingModule } from '@nestjs/testing';
import { ModelsService } from '@config/models.service';
import { SettingsService } from '@settings/settings.service';
import { MODEL_REGISTRY } from '@config/models.registry';

describe('ModelsService', () => {
  let service: ModelsService;
  let settingsService: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    const mockSettingsService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelsService, { provide: SettingsService, useValue: mockSettingsService }],
    }).compile();

    service = module.get<ModelsService>(ModelsService);
    settingsService = module.get(SettingsService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('должен вернуть все модели из реестра', () => {
      settingsService.get.mockReturnValue(null);

      const result = service.findAll();

      expect(result).toHaveLength(MODEL_REGISTRY.length);
    });

    it('должен установить available=true если API-ключ задан', () => {
      settingsService.get.mockImplementation((key: string) => {
        if (key === 'openrouter_api_key') return 'sk-or-test-key';
        return null;
      });

      const result = service.findAll();
      const openrouterModels = result.filter((m) => m.provider === 'openrouter');
      const perplexityModels = result.filter((m) => m.provider === 'perplexity');

      openrouterModels.forEach((m) => expect(m.available).toBe(true));
      perplexityModels.forEach((m) => expect(m.available).toBe(false));
    });

    it('должен установить available=false если API-ключ пустая строка', () => {
      settingsService.get.mockReturnValue('');

      const result = service.findAll();

      result.forEach((m) => expect(m.available).toBe(false));
    });

    it('должен установить available=false если API-ключ null', () => {
      settingsService.get.mockReturnValue(null);

      const result = service.findAll();

      result.forEach((m) => expect(m.available).toBe(false));
    });
  });

  describe('findByFamily', () => {
    it('должен вернуть только модели семейства claude', () => {
      settingsService.get.mockReturnValue('test-key');

      const result = service.findByFamily('claude');

      expect(result.length).toBeGreaterThan(0);
      result.forEach((m) => expect(m.family).toBe('claude'));
    });

    it('должен вернуть пустой массив для несуществующего семейства', () => {
      settingsService.get.mockReturnValue(null);

      const result = service.findByFamily('unknown');

      expect(result).toHaveLength(0);
    });
  });

  describe('findByProvider', () => {
    it('должен вернуть только модели провайдера perplexity', () => {
      settingsService.get.mockReturnValue('test-key');

      const result = service.findByProvider('perplexity');

      expect(result.length).toBeGreaterThan(0);
      result.forEach((m) => expect(m.provider).toBe('perplexity'));
    });
  });

  describe('findById', () => {
    it('должен найти модель по ID', () => {
      settingsService.get.mockReturnValue('test-key');

      const result = service.findById('anthropic/claude-opus-4-6');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('anthropic/claude-opus-4-6');
      expect(result!.name).toBe('Claude Opus 4.6');
      expect(result!.available).toBe(true);
    });

    it('должен вернуть null для несуществующего ID', () => {
      const result = service.findById('nonexistent/model');

      expect(result).toBeNull();
    });
  });
});

import { WebSearchTool } from '@integrations/llm/tools/web-search.tool';
import type { SettingsService } from '@settings/settings.service';

describe('WebSearchTool', () => {
  const settingsService = {
    get: jest.fn<string | null, [string]>(),
  };

  let tool: WebSearchTool;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    settingsService.get.mockReset();
    tool = new WebSearchTool(settingsService as unknown as SettingsService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('возвращает fallback если serper_api_key не настроен', async () => {
    settingsService.get.mockReturnValue(null);

    const result = await tool.search('рынок ИИ');

    expect(result).toBe('Web search unavailable: API key not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('форматирует результаты поиска в читаемый список', async () => {
    settingsService.get.mockReturnValue('serper-key');
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [
          {
            title: 'Result 1',
            link: 'https://example.com/1',
            snippet: 'Snippet 1',
          },
          {
            title: 'Result 2',
            link: 'https://example.com/2',
            snippet: 'Snippet 2',
          },
        ],
      }),
    } as Response);

    const result = await tool.search('рынок ИИ');

    expect(result).toContain('1. Result 1');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('2. Result 2');
  });
});

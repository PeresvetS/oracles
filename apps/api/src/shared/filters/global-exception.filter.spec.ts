import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter, maskSecrets } from '@shared/filters/global-exception.filter';

/** Хелпер: создаёт мок ArgumentsHost с нужным request/response */
function createMockHost(
  method = 'GET',
  url = '/api/test',
  headers: Record<string, string> = {},
): {
  host: ArgumentsHost;
  statusFn: jest.Mock;
  jsonFn: jest.Mock;
} {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status: statusFn }),
      getRequest: () => ({ method, url, headers }),
    }),
  } as unknown as ArgumentsHost;

  return { host, statusFn, jsonFn };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  describe('catch() — HttpException', () => {
    it('возвращает 400 для BadRequestException', () => {
      const { host, statusFn, jsonFn } = createMockHost();

      filter.catch(new BadRequestException('Некорректный запрос'), host);

      expect(statusFn).toHaveBeenCalledWith(400);
      const body: unknown = jsonFn.mock.calls[0][0];
      expect(body).toMatchObject({ statusCode: 400, message: 'Некорректный запрос' });
    });

    it('возвращает 401 для UnauthorizedException', () => {
      const { host, statusFn, jsonFn } = createMockHost();

      filter.catch(new UnauthorizedException('Не авторизован'), host);

      expect(statusFn).toHaveBeenCalledWith(401);
      const body: unknown = jsonFn.mock.calls[0][0];
      expect(body).toMatchObject({ statusCode: 401, message: 'Не авторизован' });
    });

    it('возвращает произвольный статус из HttpException', () => {
      const { host, statusFn } = createMockHost();

      filter.catch(new HttpException('Конфликт', 409), host);

      expect(statusFn).toHaveBeenCalledWith(409);
    });
  });

  describe('catch() — неизвестные ошибки', () => {
    it('возвращает 500 для обычной Error', () => {
      const { host, statusFn, jsonFn } = createMockHost();

      filter.catch(new Error('Внутренний сбой'), host);

      expect(statusFn).toHaveBeenCalledWith(500);
      const body: unknown = jsonFn.mock.calls[0][0];
      expect(body).toMatchObject({
        statusCode: 500,
        message: 'Внутренняя ошибка сервера',
      });
    });

    it('возвращает 500 при throw строки', () => {
      const { host, statusFn, jsonFn } = createMockHost();

      filter.catch('строка-ошибка', host);

      expect(statusFn).toHaveBeenCalledWith(500);
      const body: unknown = jsonFn.mock.calls[0][0];
      expect(body).toMatchObject({ statusCode: 500, message: 'Внутренняя ошибка сервера' });
    });
  });

  describe('correlationId', () => {
    it('использует X-Correlation-ID из заголовка, если он передан', () => {
      const { host, jsonFn } = createMockHost('GET', '/api/test', {
        'x-correlation-id': 'test-correlation-id',
      });

      filter.catch(new BadRequestException('Ошибка'), host);

      const body = jsonFn.mock.calls[0][0] as Record<string, unknown>;
      expect(body.correlationId).toBe('test-correlation-id');
    });

    it('включает correlationId в ответ', () => {
      const { host, jsonFn } = createMockHost();

      filter.catch(new BadRequestException('Ошибка'), host);

      const body = jsonFn.mock.calls[0][0] as Record<string, unknown>;
      expect(body.correlationId).toBeDefined();
      expect(typeof body.correlationId).toBe('string');
    });

    it('correlationId — валидный UUID v4', () => {
      const { host, jsonFn } = createMockHost();

      filter.catch(new BadRequestException('Ошибка'), host);

      const body = jsonFn.mock.calls[0][0] as Record<string, unknown>;
      expect(body.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('каждый вызов генерирует уникальный correlationId', () => {
      const { host: host1, jsonFn: jsonFn1 } = createMockHost();
      const { host: host2, jsonFn: jsonFn2 } = createMockHost();

      filter.catch(new BadRequestException('Ошибка 1'), host1);
      filter.catch(new BadRequestException('Ошибка 2'), host2);

      const body1 = jsonFn1.mock.calls[0][0] as Record<string, unknown>;
      const body2 = jsonFn2.mock.calls[0][0] as Record<string, unknown>;
      expect(body1.correlationId).not.toBe(body2.correlationId);
    });
  });
});

describe('maskSecrets()', () => {
  it('маскирует Bearer-токен', () => {
    const result = maskSecrets('Authorization: Bearer eyJhbGc.eyJzdWI.signature');
    expect(result).toBe('Authorization: Bearer ***');
  });

  it('маскирует sk-*** API-ключ', () => {
    const result = maskSecrets('Ключ: sk-openai123456789012345');
    expect(result).toBe('Ключ: sk-***');
  });

  it('маскирует JSON-поле apiKey', () => {
    const result = maskSecrets('"apiKey": "super-secret-value"');
    expect(result).toBe('"apiKey": "***"');
  });

  it('маскирует JSON-поле password', () => {
    const result = maskSecrets('"password": "my-p@ssw0rd"');
    expect(result).toBe('"password": "***"');
  });

  it('не трогает обычный текст без секретов', () => {
    const text = 'GET /api/sessions → 200: OK';
    expect(maskSecrets(text)).toBe(text);
  });

  it('маскирует несколько секретов в одной строке', () => {
    const result = maskSecrets('Bearer sk-key1234567890 и sk-other1234567890');
    expect(result).toBe('Bearer *** и sk-***');
  });
});

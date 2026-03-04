import { UserThrottlerGuard } from '@shared/guards/user-throttler.guard';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;
  let getTracker: (req: Record<string, unknown>) => Promise<string>;

  beforeEach(() => {
    guard = Object.create(UserThrottlerGuard.prototype) as UserThrottlerGuard;
    getTracker = (
      guard as unknown as { getTracker: (req: Record<string, unknown>) => Promise<string> }
    ).getTracker.bind(guard);
  });

  it('использует user.id как tracker для авторизованного запроса', async () => {
    const tracker = await getTracker({
      user: { id: 'user-123' },
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('user:user-123');
  });

  it('использует user.sub как fallback для JWT payload', async () => {
    const tracker = await getTracker({
      user: { sub: 'sub-456' },
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('user:sub-456');
  });

  it('использует первый x-forwarded-for для неавторизованных запросов', async () => {
    const tracker = await getTracker({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('ip:203.0.113.5');
  });

  it('использует req.ip если x-forwarded-for не задан', async () => {
    const tracker = await getTracker({
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('ip:127.0.0.1');
  });
});

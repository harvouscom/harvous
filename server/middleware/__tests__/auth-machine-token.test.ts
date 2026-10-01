import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyToken = vi.fn();

vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => verifyToken(...args),
  createClerkClient: vi.fn(),
}));
vi.mock('../../db/client', () => ({ getDb: vi.fn() }));
vi.mock('../../utils/merge-user-into-live', () => ({ mergeDevUserIntoLive: vi.fn() }));

const { clerkAuth } = await import('../auth');

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function jwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return `${b64url(header)}.${b64url(payload)}.${Buffer.from("s".repeat(64)).toString("base64url")}`;
}

async function run(authorization: string) {
  const vars = new Map<string, unknown>();
  const c = {
    req: { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) },
    set: (key: string, value: unknown) => vars.set(key, value),
  };
  const next = vi.fn();
  await clerkAuth(c as never, next);
  expect(next).toHaveBeenCalledOnce();
  return vars.get('auth') as { userId: string | null };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
});

describe('session middleware refuses Connector (OAuth) tokens', () => {
  it('refuses an opaque OAuth token without verifying it', async () => {
    const auth = await run('Bearer oat_0123456789abcdef');
    expect(auth.userId).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('refuses an at+jwt OAuth JWT without verifying it', async () => {
    const token = jwt({ alg: 'RS256', typ: 'at+jwt' }, { sub: 'user_1', client_id: 'c_1' });
    const auth = await run(`Bearer ${token}`);
    expect(auth.userId).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('refuses a verified token that carries client_id even when typ is missing', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1', client_id: 'c_1', scope: 'profile' });
    const token = jwt({ alg: 'RS256' }, { sub: 'user_1', client_id: 'c_1' });
    const auth = await run(`Bearer ${token}`);
    expect(verifyToken).toHaveBeenCalledOnce();
    expect(auth.userId).toBeNull();
  });

  it('still accepts an ordinary session token', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1', sid: 'sess_1' });
    const token = jwt({ alg: 'RS256', typ: 'JWT' }, { sub: 'user_1', sid: 'sess_1' });
    const auth = await run(`Bearer ${token}`);
    expect(auth.userId).toBe('user_1');
  });
});

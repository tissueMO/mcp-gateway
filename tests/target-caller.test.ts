import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TargetCaller } from '../src/target-caller.js';
import { TargetsMap } from '../src/types.js';

describe('TargetCaller', () => {
  let mockSsmClient: { send: ReturnType<typeof vi.fn> };
  let targetCaller: TargetCaller;

  const mockTargets: TargetsMap = {
    IFTTT: {
      baseUrl: 'https://maker.ifttt.com',
      allowedMethods: ['POST'],
    },
    HomeServer: {
      baseUrl: 'https://homeserver.example.com',
      allowedMethods: ['GET', 'POST'],
      defaultHeaders: {
        'X-Server-Secret': 'secret-123',
      },
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSsmClient = {
      send: vi.fn().mockResolvedValue({
        Parameter: {
          Value: JSON.stringify(mockTargets, null, 2),
        },
      }),
    };
    targetCaller = new TargetCaller(mockSsmClient as any, '/mcp-gateway/targets');
  });

  it('SSMからターゲット一覧を取得し、HomeServerへのクエリー付きパス (/busy/turn?id=101) を正しく実行する', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValueOnce(JSON.stringify({ success: true, busy: true })),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await targetCaller.call({
      target: 'HomeServer',
      path: '/busy/turn?id=101',
      method: 'GET',
      headers: { 'X-Spark-Source': 'gemini' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://homeserver.example.com/busy/turn?id=101',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'x-server-secret': 'secret-123',
          'x-spark-source': 'gemini',
        },
      })
    );

    expect(result).toEqual({
      status: 200,
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
      data: { success: true, busy: true },
    });
  });

  it('大文字小文字を区別せずにターゲット（例: homeserver）を解決できる', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValueOnce('OK'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await targetCaller.call({
      target: 'homeserver',
      path: '/status',
      method: 'GET',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://homeserver.example.com/status',
      expect.anything()
    );
    expect(result.data).toBe('OK');
  });

  it('未定義のターゲットへの呼び出しはエラーを返す', async () => {
    await expect(
      targetCaller.call({
        target: 'unknown-target',
        method: 'GET',
      })
    ).rejects.toThrow('未定義のターゲットです: unknown-target');
  });

  it('許可されていないHTTPメソッドが指定された場合はエラーを返す (IFTTT への GET など)', async () => {
    await expect(
      targetCaller.call({
        target: 'IFTTT',
        path: '/trigger/event/with/key/xxx',
        method: 'GET',
      })
    ).rejects.toThrow('許可されていないHTTPメソッドです: GET');
  });

  it('getTargetNames で登録済みターゲット名の一覧を取得できる', async () => {
    const names = await targetCaller.getTargetNames();
    expect(names).toEqual(['IFTTT', 'HomeServer']);
  });
});

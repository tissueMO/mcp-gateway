import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpServer, handleMcpRequest } from '../src/mcp-server.js';

describe('McpServer', () => {
  let mockTargetCaller: { call: ReturnType<typeof vi.fn>; getTargetNames: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTargetCaller = {
      call: vi.fn(),
      getTargetNames: vi.fn().mockResolvedValue(['IFTTT', 'HomeServer']),
    };
  });

  it('initialize リクエストに対して正常なサーバー情報を返す', async () => {
    const server = createMcpServer(mockTargetCaller as any);
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'gemini-spark', version: '1.0.0' },
      },
    };

    const response = await handleMcpRequest(server, mockTargetCaller as any, request);
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'mcp-gateway',
          version: '1.0.0',
          iconUrl: '/icon.png',
        },
      },
    });
  });

  it('tools/list リクエストに対して call_api ツールの定義と動的ターゲット一覧を返す', async () => {
    const server = createMcpServer(mockTargetCaller as any);
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    const response = await handleMcpRequest(server, mockTargetCaller as any, request);
    expect(response.result.tools).toHaveLength(1);
    const tool = response.result.tools[0];
    expect(tool.name).toBe('call_api');
    expect(tool.inputSchema.properties.target).toHaveProperty('enum', ['IFTTT', 'HomeServer']);
    expect(tool.inputSchema.properties.target.description).toContain('IFTTT, HomeServer');
    expect(tool.inputSchema.properties).toHaveProperty('method');
  });

  it('tools/call リクエストで call_api を実行し、結果を返す', async () => {
    mockTargetCaller.call.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { result: 'ok' },
    });

    const server = createMcpServer(mockTargetCaller as any);
    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'call_api',
        arguments: {
          target: 'my-service',
          path: '/test',
          method: 'GET',
        },
      },
    };

    const response = await handleMcpRequest(server, mockTargetCaller as any, request);
    expect(mockTargetCaller.call).toHaveBeenCalledWith({
      target: 'my-service',
      path: '/test',
      method: 'GET',
    });

    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed.status).toBe(200);
    expect(parsed.data).toEqual({ result: 'ok' });
  });

  it('ツール実行時にエラーが発生した場合は isError: true とエラー内容を返す', async () => {
    mockTargetCaller.call.mockRejectedValueOnce(new Error('未定義のターゲットです: unknown'));

    const server = createMcpServer(mockTargetCaller as any);
    const request = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'call_api',
        arguments: {
          target: 'unknown',
          method: 'GET',
        },
      },
    };

    const response = await handleMcpRequest(server, mockTargetCaller as any, request);
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('未定義のターゲットです');
  });
});

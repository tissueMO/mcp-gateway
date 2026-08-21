import { describe, it, expect, vi } from 'vitest';
import { handler } from '../src/index.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('Lambda Handler', () => {
  it('OPTIONS リクエストに対して 200 OK と CORS ヘッダーを返す', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'OPTIONS',
          path: '/mcp',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
      } as any,
      rawPath: '/mcp',
      headers: {
        origin: 'https://gemini.google.com',
      },
    };

    const response: any = await handler(event as any);
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('GET /icon.png リクエストに対して 200 OK と image/png ヘッダー、Base64画像を返す', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: '/icon.png',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
      } as any,
      rawPath: '/icon.png',
      headers: {},
    };

    const response: any = await handler(event as any);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.isBase64Encoded).toBe(true);
    expect(response.body).toBeDefined();
  });

  it('GET /.well-known/oauth-authorization-server に対して 200 OK を返す', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: '/.well-known/oauth-authorization-server',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
      } as any,
      rawPath: '/.well-known/oauth-authorization-server',
      headers: {},
    };

    const response: any = await handler(event as any);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('issuer');
    expect(body).toHaveProperty('token_endpoint');
  });

  it('POST /mcp に対して MCP JSON-RPC リクエストを正常に処理する', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/mcp',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
      } as any,
      rawPath: '/mcp',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    };

    const response: any = await handler(event as any);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.serverInfo.name).toBe('mcp-gateway');
  });
});

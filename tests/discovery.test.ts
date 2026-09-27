import { describe, it, expect } from 'vitest';
import { handleDiscoveryRequest } from '../src/discovery-handler.js';

describe('DiscoveryHandler', () => {
  const env = {
    COGNITO_USER_POOL_ID: 'ap-northeast-1_xxxxxxxxx',
    COGNITO_DOMAIN: 'mcp-gateway-auth-test.auth.ap-northeast-1.amazoncognito.com',
    AWS_REGION: 'ap-northeast-1',
    CUSTOM_DOMAIN: 'mcp.example.com',
  };

  it('GET /.well-known/oauth-authorization-server で認可サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-authorization-server', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.issuer).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.token_endpoint).toBe(`https://${env.COGNITO_DOMAIN}/oauth2/token`);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /.well-known/oauth-authorization-server で code_challenge_methods_supported に S256 を設定した認可サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-authorization-server', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('GET /.well-known/openid-configuration で認可サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/openid-configuration', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.issuer).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.token_endpoint).toBe(`https://${env.COGNITO_DOMAIN}/oauth2/token`);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /.well-known/oauth-protected-resource でリソースサーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-protected-resource', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.resource).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.authorization_servers).toEqual([`https://${env.CUSTOM_DOMAIN}`]);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /.well-known/oauth-protected-resource/mcp で /mcp のリソースサーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-protected-resource/mcp', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.resource).toBe(`https://${env.CUSTOM_DOMAIN}/mcp`);
    expect(body.authorization_servers).toEqual([`https://${env.CUSTOM_DOMAIN}`]);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /mcp/.well-known/oauth-protected-resource でリソースサーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/mcp/.well-known/oauth-protected-resource', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.authorization_servers).toEqual([`https://${env.CUSTOM_DOMAIN}`]);
  });

  it('GET /mcp/.well-known/oauth-authorization-server で認可サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/mcp/.well-known/oauth-authorization-server', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.issuer).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('GET /mcp/.well-known/openid-configuration で認可サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/mcp/.well-known/openid-configuration', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.issuer).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
  });

  it.each([
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
    '/.well-known/oauth-protected-resource',
    '/mcp/.well-known/oauth-authorization-server',
    '/mcp/.well-known/openid-configuration',
    '/mcp/.well-known/oauth-protected-resource',
  ])('GET %s で CORS ヘッダーを返す', (path) => {
    const result = handleDiscoveryRequest(path, env);
    expect(result.headers['access-control-allow-origin']).toBe('*');
    const allowMethods = result.headers['access-control-allow-methods'];
    expect(allowMethods).toBeDefined();
    expect(allowMethods).toMatch(/GET/i);
    expect(allowMethods).toMatch(/POST/i);
    expect(allowMethods).toMatch(/OPTIONS/i);
    expect(result.headers['access-control-allow-headers']).toBeDefined();
  });

  it('未定義の Discovery パスには 404 を返す', () => {
    const result = handleDiscoveryRequest('/.well-known/unknown', env);
    expect(result.statusCode).toBe(404);
  });
});


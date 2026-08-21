import { describe, it, expect } from 'vitest';
import { handleDiscoveryRequest } from '../src/discovery-handler.js';

describe('DiscoveryHandler', () => {
  const env = {
    COGNITO_USER_POOL_ID: 'ap-northeast-1_xxxxxxxxx',
    COGNITO_DOMAIN: 'mcp-gateway-auth-test.auth.ap-northeast-1.amazoncognito.com',
    AWS_REGION: 'ap-northeast-1',
    CUSTOM_DOMAIN: 'mcp.example.com',
  };

  it('GET /.well-known/oauth-authorization-server で Cognito の認証サーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-authorization-server', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.issuer).toBe(`https://cognito-idp.${env.AWS_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`);
    expect(body.token_endpoint).toBe(`https://${env.COGNITO_DOMAIN}/oauth2/token`);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /.well-known/oauth-protected-resource でリソースサーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-protected-resource', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.resource).toBe(`https://${env.CUSTOM_DOMAIN}`);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('GET /.well-known/oauth-protected-resource/mcp で /mcp のリソースサーバーメタデータを返す', () => {
    const result = handleDiscoveryRequest('/.well-known/oauth-protected-resource/mcp', env);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.resource).toBe(`https://${env.CUSTOM_DOMAIN}/mcp`);
    expect(body.scopes_supported).toContain(`https://${env.CUSTOM_DOMAIN}/mcp.access`);
  });

  it('未定義の Discovery パスには 404 を返す', () => {
    const result = handleDiscoveryRequest('/.well-known/unknown', env);
    expect(result.statusCode).toBe(404);
  });
});

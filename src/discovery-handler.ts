import { AppEnvironment } from './types.js';

export interface DiscoveryResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-session-id',
};

/**
 * OAuth / MCP Discovery エンドポイントへのリクエストを処理します。
 * @param path リクエストパス
 * @param env 環境変数設定
 * @returns レスポンスオブジェクト
 */
export function handleDiscoveryRequest(path: string, env: AppEnvironment): DiscoveryResponse {
  const normalizedPath = path.startsWith('/mcp/.well-known/') ? path.slice(4) : path;

  const region = env.AWS_REGION || 'ap-northeast-1';
  const userPoolId = env.COGNITO_USER_POOL_ID || '';
  const cognitoDomain = env.COGNITO_DOMAIN || '';
  const customDomain = env.CUSTOM_DOMAIN || 'mcp.example.com';

  const cognitoIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const authServerIssuer = `https://${customDomain}`;
  const authBase = cognitoDomain.startsWith('http') ? cognitoDomain : `https://${cognitoDomain}`;
  const customScope = `https://${customDomain}/mcp.access`;

  // OAuth 2.0 / OIDC 認可サーバーメタデータの返却
  if (
    normalizedPath === '/.well-known/oauth-authorization-server' ||
    normalizedPath === '/.well-known/openid-configuration' ||
    normalizedPath.startsWith('/.well-known/oauth-authorization-server/') ||
    normalizedPath.startsWith('/.well-known/openid-configuration/')
  ) {
    const metadata = {
      issuer: authServerIssuer,
      authorization_endpoint: `${authBase}/oauth2/authorize`,
      token_endpoint: `${authBase}/oauth2/token`,
      userinfo_endpoint: `${authBase}/oauth2/userInfo`,
      jwks_uri: `${cognitoIssuer}/.well-known/jwks.json`,
      response_types_supported: ['code', 'token'],
      grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'email', 'profile', customScope],
      logo_uri: `https://${customDomain}/icon.png`,
      op_logo_uri: `https://${customDomain}/icon.png`,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(metadata, null, 2),
    };
  }

  // OAuth 2.0 保護リソースメタデータの返却 (/mcp サブパス含む)
  if (normalizedPath.startsWith('/.well-known/oauth-protected-resource')) {
    const resourceUrl = path.endsWith('/mcp') ? `https://${customDomain}/mcp` : `https://${customDomain}`;
    const metadata = {
      resource: resourceUrl,
      authorization_servers: [authServerIssuer],
      scopes_supported: ['openid', 'email', 'profile', customScope],
      bearer_methods_supported: ['header'],
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(metadata, null, 2),
    };
  }

  // 未定義パスのエラー返却
  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Not Found' }),
  };
}

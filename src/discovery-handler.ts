import { AppEnvironment } from './types.js';

export interface DiscoveryResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * OAuth / MCP Discovery エンドポイントへのリクエストを処理します。
 * @param path リクエストパス
 * @param env 環境変数設定
 * @returns レスポンスオブジェクト
 */
export function handleDiscoveryRequest(path: string, env: AppEnvironment): DiscoveryResponse {
  const region = env.AWS_REGION || 'ap-northeast-1';
  const userPoolId = env.COGNITO_USER_POOL_ID || '';
  const cognitoDomain = env.COGNITO_DOMAIN || '';
  const customDomain = env.CUSTOM_DOMAIN || 'mcp.example.com';

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const authBase = cognitoDomain.startsWith('http') ? cognitoDomain : `https://${cognitoDomain}`;
  const customScope = `https://${customDomain}/mcp.access`;

  // OAuth 2.0 認可サーバーメタデータの返却
  if (path === '/.well-known/oauth-authorization-server') {
    const metadata = {
      issuer,
      authorization_endpoint: `${authBase}/oauth2/authorize`,
      token_endpoint: `${authBase}/oauth2/token`,
      userinfo_endpoint: `${authBase}/oauth2/userInfo`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
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
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify(metadata, null, 2),
    };
  }

  // OAuth 2.0 保護リソースメタデータの返却 (/mcp サブパス含む)
  if (path.startsWith('/.well-known/oauth-protected-resource')) {
    const resourceUrl = path.endsWith('/mcp') ? `https://${customDomain}/mcp` : `https://${customDomain}`;
    const metadata = {
      resource: resourceUrl,
      authorization_servers: [issuer],
      scopes_supported: ['openid', 'email', 'profile', customScope],
      bearer_methods_supported: ['header'],
    };

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify(metadata, null, 2),
    };
  }

  // 未定義パスのエラー返却
  return {
    statusCode: 404,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify({ error: 'Not Found' }),
  };
}

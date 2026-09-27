import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TargetCaller } from './target-caller.js';
import { createMcpServer, handleMcpRequest } from './mcp-server.js';
import { handleDiscoveryRequest } from './discovery-handler.js';
import { AppEnvironment } from './types.js';
import { ICON_PNG_BASE64 } from './icon-data.js';

// シングルトンインスタンスの初期化
const targetCaller = new TargetCaller(undefined, process.env.TARGETS_PARAMETER_NAME || '/mcp-gateway/targets');
const mcpServer = createMcpServer(targetCaller);

/**
 * CORSヘッダー定義。
 */
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-session-id',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/**
 * API Gateway HTTP API からのリクエストを処理する Lambda エントリーポイントです。
 * @param event API Gateway Proxy Event v2
 * @returns HTTP レスポンスオブジェクト
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method?.toUpperCase() || 'GET';
  const path = event.rawPath || '/';

  console.log(`[HTTP REQ] ${method} ${path} User-Agent="${event.headers?.['user-agent'] || ''}"`);

  let response: APIGatewayProxyResultV2;

  // CORSプリフライトリクエストの処理
  if (method === 'OPTIONS') {
    response = {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  } else if (path === '/icon.png' || path === '/favicon.ico' || path === '/assets/icon.png') {
    // アイコン画像の配信
    response = {
      statusCode: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400',
        ...CORS_HEADERS,
      },
      isBase64Encoded: true,
      body: ICON_PNG_BASE64,
    };
  } else if (path.startsWith('/.well-known/') || path.startsWith('/mcp/.well-known/')) {
    // OAuth / MCP Discovery エンドポイントのルーティング
    const env: AppEnvironment = {
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
      COGNITO_DOMAIN: process.env.COGNITO_DOMAIN,
      AWS_REGION: process.env.AWS_REGION || 'ap-northeast-1',
      CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN || (event.headers && (event.headers['host'] || event.headers['Host'])) || 'mcp.example.com',
    };
    response = handleDiscoveryRequest(path, env);
  } else if ((path === '/' || path === '') && method === 'GET') {
    // ルートパスへの GET リクエスト (ヘルスチェック・ステータス情報)
    response = {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify({
        status: 'ok',
        name: 'mcp-gateway',
        version: '1.0.0',
        protocol: 'mcp',
        endpoints: {
          mcp: '/mcp',
          discovery: '/.well-known/oauth-authorization-server',
        },
      }),
    };
  } else if (path === '/mcp' || path === '/mcp/' || path === '/' || path === '') {
    // MCP エンドポイントのルーティング
    try {
      let body: any = {};
      if (event.body) {
        const rawBody = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        if (rawBody.trim()) {
          body = JSON.parse(rawBody);
        }
      }

      // 運用ログ: MCP メソッドの記録
      if (body.method) {
        const detail = body.method === 'tools/call'
          ? ` (tool: ${body.params?.name}, target: ${body.params?.arguments?.target}, path: ${body.params?.arguments?.path || '/'})`
          : '';
        console.log(`[MCP] method=${body.method}${detail}`);
      }

      const mcpResponse = await handleMcpRequest(mcpServer, targetCaller, body);
      response = {
        statusCode: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-protocol-version': '2024-11-05',
          ...CORS_HEADERS,
        },
        body: JSON.stringify(mcpResponse),
      };
    } catch (error: any) {
      console.error(`[ERROR] MCP request parsing error: ${error.message}`);
      response = {
        statusCode: 400,
        headers: {
          'content-type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: `リクエストの解析に失敗しました: ${error.message}`,
          },
        }),
      };
    }
  } else {
    // 未定義ルートのエラー返却
    console.warn(`[WARN] Not Found: ${method} ${path}`);
    response = {
      statusCode: 404,
      headers: {
        'content-type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ error: 'Not Found', path }),
    };
  }

  console.log(`[HTTP RES] ${method} ${path} -> ${response.statusCode}`);
  return response;
}

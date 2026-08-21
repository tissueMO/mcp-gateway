/**
 * E2E 統合検証スクリプト
 *
 * 使用方法:
 *   node scripts/verify-integration.mjs <CLIENT_ID> <CLIENT_SECRET> [TARGET_NAME] [PATH]
 */
async function main() {
  const customDomain = process.env.DOMAIN_NAME || 'mcp.example.com';
  const clientId = process.argv[2] || process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.argv[3] || process.env.COGNITO_CLIENT_SECRET;
  const cognitoDomain = process.env.COGNITO_DOMAIN || 'myprivate-auth-123456789012.auth.ap-northeast-1.amazoncognito.com';
  const targetName = process.argv[4] || 'HomeServer';
  const targetPath = process.argv[5] || '/busy/turn?id=101';

  if (!clientId || !clientSecret) {
    console.error('エラー: CLIENT_ID と CLIENT_SECRET を引数または環境変数で指定してください。');
    console.error('例: node scripts/verify-integration.mjs <CLIENT_ID> <CLIENT_SECRET>');
    process.exit(1);
  }

  const tokenEndpoint = `https://${cognitoDomain}/oauth2/token`;
  const mcpUrl = `https://${customDomain}/mcp`;

  console.log('=== 1. OAuth 2.0 Access Token 取得 ===');
  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: `grant_type=client_credentials&scope=https://${customDomain}/mcp.access`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log('Access Token acquired successfully.');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log('\n=== 2. MCP initialize リクエスト ===');
  const initRes = await fetch(mcpUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-gateway-verifier', version: '1.0.0' },
      },
    }),
  });
  console.log('Status:', initRes.status);
  const initData = await initRes.json();
  console.log('Response:', JSON.stringify(initData, null, 2));

  console.log('\n=== 3. MCP tools/list リクエスト ===');
  const listRes = await fetch(mcpUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  });
  console.log('Status:', listRes.status);
  const listData = await listRes.json();
  console.log('Tools:', JSON.stringify(listData.result.tools, null, 2));

  console.log(`\n=== 4. MCP tools/call (${targetName} ターゲット: ${targetPath} 呼び出し) ===`);
  const callRes = await fetch(mcpUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'call_api',
        arguments: {
          target: targetName,
          path: targetPath,
          method: 'GET',
        },
      },
    }),
  });
  console.log('Status:', callRes.status);
  const callData = await callRes.json();
  console.log('Result:', JSON.stringify(callData, null, 2));
}

main().catch(console.error);

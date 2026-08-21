import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { createMcpServer } from './mcp-server.js';
import { TargetCaller } from './target-caller.js';

/**
 * ローカル開発・検証用の MCP サーバー起動エントリーポイント
 * Stdio トランスポートを使用して MCP Inspector や Claude Desktop と接続します。
 */
async function main() {
  const region = process.env.AWS_REGION || 'ap-northeast-1';
  const parameterName = process.env.TARGETS_PARAMETER_NAME || '/mcp-gateway/targets';

  const ssmClient = new SSMClient({ region });
  const targetCaller = new TargetCaller(ssmClient, parameterName);
  const server = createMcpServer(targetCaller);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Gateway (Local Stdio Mode) started.');
}

main().catch((error) => {
  console.error('Fatal error starting local MCP server:', error);
  process.exit(1);
});

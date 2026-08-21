import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TargetCaller } from './target-caller.js';

/**
 * MCPサーバーインスタンスを生成し、call_apiツールを登録します。
 * @param targetCaller ターゲット呼び出しインスタンス
 * @returns 設定済みのMcpServerインスタンス
 */
export function createMcpServer(targetCaller: TargetCaller): McpServer {
  const server = new McpServer({
    name: 'mcp-gateway',
    version: '1.0.0',
  });

  // 外部API実行用 call_api ツールの登録
  server.tool(
    'call_api',
    '事前にSSMパラメーターストアに登録されたターゲット（接続先）に対してHTTPリクエストを発行し、外部への実行や状態変更を行います。未定義の接続先への通信は拒否されます。',
    {
      target: z.string().describe('SSMパラメーターストアに登録されたターゲット名'),
      path: z.string().optional().describe('ターゲットBase URLに対する相対パス（例: /busy/turn?id=101）'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTPメソッド'),
      headers: z.record(z.string()).optional().describe('追加のリクエストヘッダー（キーと値のマップ）'),
      query: z.record(z.string()).optional().describe('URLクエリーパラメーター（キーと値のマップ）'),
      body: z.string().optional().describe('リクエストボディ（JSON文字列またはテキスト）'),
    },
    async (args) => {
      try {
        const result = await targetCaller.call({
          target: args.target,
          path: args.path,
          method: args.method,
          headers: args.headers,
          query: args.query,
          body: args.body,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `エラーが発生しました: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

/**
 * JSON-RPCリクエストをMCPサーバーで処理し、レスポンスオブジェクトを返します。
 * @param server McpServerインスタンス
 * @param targetCaller ターゲット呼び出しインスタンス
 * @param request JSON-RPCリクエストオブジェクト
 * @returns JSON-RPCレスポンスオブジェクト
 */
export async function handleMcpRequest(server: McpServer, targetCaller: TargetCaller, request: any): Promise<any> {
  const id = request.id ?? null;
  const method = request.method;
  const params = request.params || {};

  // 初期化リクエストの処理
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
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
    };
  }

  // 初期化通知・pingの処理
  if (method === 'notifications/initialized' || method === 'ping') {
    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  // ツール一覧取得リクエストの処理 (SSMパラメータからターゲット一覧を動的解決)
  if (method === 'tools/list') {
    let targetNames: string[] = [];
    try {
      targetNames = await targetCaller.getTargetNames();
    } catch {
      // 取得失敗時は空配列のまま処理を継続
    }

    const targetDescription = targetNames.length > 0
      ? `SSMパラメーターストアに登録されたターゲット名（利用可能: ${targetNames.join(', ')}）`
      : 'SSMパラメーターストアに登録されたターゲット名';

    const registeredTools = (server as any)._registeredTools || {};
    const tools = Object.entries(registeredTools).map(([name, toolDef]: [string, any]) => {
      // zod スキーマから標準 JSON Schema を生成
      const zodSchema = toolDef.inputSchema;
      const shape = typeof zodSchema?.shape === 'object' ? zodSchema.shape : (typeof zodSchema?._def?.shape === 'function' ? zodSchema._def.shape() : {});
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodType = value as any;
        let description = zodType._def?.description || zodType.description || '';
        let type = 'string';
        let enumValues: string[] | undefined = undefined;

        let innerType = zodType;
        let isOptional = false;

        if (innerType._def?.typeName === 'ZodOptional') {
          isOptional = true;
          innerType = innerType._def.innerType;
        }

        if (innerType._def?.typeName === 'ZodEnum') {
          type = 'string';
          enumValues = innerType._def.values;
        } else if (innerType._def?.typeName === 'ZodRecord') {
          type = 'object';
        } else if (innerType._def?.typeName === 'ZodString') {
          type = 'string';
        }

        // target プロパティの場合は動的 enum と説明文を適用
        if (key === 'target') {
          description = targetDescription;
          if (targetNames.length > 0) {
            enumValues = targetNames;
          }
        }

        properties[key] = {
          type,
          description,
          ...(enumValues ? { enum: enumValues } : {}),
        };

        if (!isOptional && typeof zodType.isOptional === 'function' && !zodType.isOptional()) {
          required.push(key);
        }
      }

      return {
        name,
        description: toolDef.description,
        inputSchema: {
          type: 'object',
          properties,
          required,
        },
      };
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools,
      },
    };
  }

  // ツール実行リクエストの処理
  if (method === 'tools/call') {
    const toolName = params.name;
    const toolArgs = params.arguments || {};
    const registeredTools = (server as any)._registeredTools || {};
    const toolDef = registeredTools[toolName];

    if (!toolDef) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `未定義のツールです: ${toolName}`,
        },
      };
    }

    try {
      const handlerResult = await toolDef.handler(toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: handlerResult,
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: `ツールの実行中にエラーが発生しました: ${error.message}`,
            },
          ],
        },
      };
    }
  }

  // 未対応メソッドのエラー返却
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `未対応のMCPメソッドです: ${method}`,
    },
  };
}

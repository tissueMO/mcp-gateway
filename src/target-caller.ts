import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { CallApiArgs, CallApiResponse, TargetConfig, TargetsMap } from './types.js';

/**
 * ターゲット設定の取得とHTTPリクエストの実行を担当するクラスです。
 */
export class TargetCaller {
  private ssmClient: SSMClient;
  private parameterName: string;
  private cache: { targets: TargetsMap; fetchedAt: number } | null = null;
  private cacheTtlMs = 60 * 1000;

  /**
   * コンストラクター
   * @param ssmClient SSMクライアントインスタンス
   * @param parameterName SSMパラメーターストアのパラメーター名
   */
  constructor(ssmClient?: SSMClient, parameterName = '/mcp-gateway/targets') {
    this.ssmClient = ssmClient || new SSMClient({});
    this.parameterName = parameterName;
  }

  /**
   * 指定されたターゲットに対してHTTPリクエストを実行します。
   * ※未定義のターゲットまたは不許可のメソッドの場合は例外を送出します。
   * @param args API呼び出し引数
   * @returns 実行結果レスポンス
   */
  async call(args: CallApiArgs): Promise<CallApiResponse> {
    // ターゲット設定マップの取得と対象ターゲットの検索
    const targets = await this.getAllTargets();
    const config = this.findTargetConfig(targets, args.target);
    if (!config) {
      const available = Object.keys(targets).join(', ');
      throw new Error(`未定義のターゲットです: ${args.target} (登録済みターゲット: ${available || 'なし'})`);
    }

    // HTTPメソッドの認可チェック
    const method = args.method.toUpperCase();
    const allowed = config.allowedMethods?.map((m) => m.toUpperCase()) || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!allowed.includes(method)) {
      throw new Error(`許可されていないHTTPメソッドです: ${args.method} (許可: ${allowed.join(', ')})`);
    }

    // リクエストURLとクエリーパラメーターの構築
    const url = this.buildUrl(config.baseUrl, args.path, args.query);

    // リクエストヘッダーの結合
    const headers = this.buildHeaders(config.defaultHeaders, args.headers, args.body, args.formData);

    // リクエストボディの整形
    const body = this.buildBody(method, headers['content-type'], args.body, args.formData);

    // HTTPリクエストの送信
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    // レスポンスヘッダーの抽出
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    // レスポンスボディの取得とパース
    const text = await response.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // JSONパースに失敗した場合はテキストのまま扱う
    }

    return {
      status: response.status,
      headers: responseHeaders,
      data,
    };
  }

  /**
   * SSMパラメーターストアから登録済みターゲット名の一覧を取得します。
   * @returns ターゲット名の一覧配列
   */
  async getTargetNames(): Promise<string[]> {
    const targets = await this.getAllTargets();
    return Object.keys(targets);
  }

  /**
   * SSMパラメーターストアから全ターゲット設定を取得します。
   * @returns 全ターゲットマップ
   */
  private async getAllTargets(): Promise<TargetsMap> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.targets;
    }

    try {
      const command = new GetParameterCommand({
        Name: this.parameterName,
        WithDecryption: true,
      });
      const response = await this.ssmClient.send(command);
      if (!response.Parameter?.Value) {
        throw new Error(`SSMパラメーターが見つかりません: ${this.parameterName}`);
      }

      const targets: TargetsMap = JSON.parse(response.Parameter.Value);
      this.cache = { targets, fetchedAt: Date.now() };
      return targets;
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        throw new Error(`SSMパラメーターが見つかりません: ${this.parameterName}`);
      }
      throw new Error(`ターゲット設定の取得に失敗しました: ${error.message}`);
    }
  }

  /**
   * 大文字小文字を区別せずにターゲット設定を検索します。
   * @param targets ターゲットマップ
   * @param targetName ターゲット名
   * @returns ターゲット設定
   */
  private findTargetConfig(targets: TargetsMap, targetName: string): TargetConfig | undefined {
    if (targets[targetName]) {
      return targets[targetName];
    }

    const lower = targetName.toLowerCase();
    for (const [key, value] of Object.entries(targets)) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Base URL、パス（クエリー文字列含む）、追加クエリーを安全に結合して完全なURLを生成します。
   * @param baseUrl ベースURL
   * @param path 相対パス
   * @param query 追加クエリーパラメーター
   * @returns 完全なURL文字列
   */
  private buildUrl(baseUrl: string, path?: string, query?: Record<string, string>): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const subPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const url = new URL(`${base}${subPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * デフォルトヘッダーとカスタムヘッダーを小文字正規化してマージします。
   * @param defaultHeaders デフォルトヘッダー
   * @param customHeaders カスタムヘッダー
   * @param body リクエストボディ
   * @param formData フォームデータ
   * @returns マージ済みヘッダー
   */
  private buildHeaders(
    defaultHeaders?: Record<string, string>,
    customHeaders?: Record<string, string>,
    body?: any,
    formData?: Record<string, any>
  ): Record<string, string> {
    const result: Record<string, string> = {};

    if (defaultHeaders) {
      for (const [key, value] of Object.entries(defaultHeaders)) {
        result[key.toLowerCase()] = value;
      }
    }

    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        result[key.toLowerCase()] = value;
      }
    }

    // フォームデータが指定されている場合は application/x-www-form-urlencoded を設定
    if (formData && !result['content-type']) {
      result['content-type'] = 'application/x-www-form-urlencoded';
    } else if (body !== undefined && !result['content-type']) {
      // ボディが存在しContent-Typeが未指定の場合はapplication/jsonを設定
      result['content-type'] = 'application/json';
    }

    return result;
  }

  /**
   * HTTPメソッド、Content-Type、ボディ内容からfetchに渡すボディを整形します。
   * @param method HTTPメソッド
   * @param contentType Content-Typeヘッダー
   * @param body ボディ内容
   * @param formData フォームデータ
   * @returns 整形済みボディ
   */
  private buildBody(
    method: string,
    contentType?: string,
    body?: any,
    formData?: Record<string, any>
  ): string | undefined {
    if (method === 'GET' || method === 'HEAD') {
      return undefined;
    }

    // 1. formData が明示的に渡された場合
    if (formData && typeof formData === 'object') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(formData)) {
        if (v !== undefined && v !== null) {
          params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
      return params.toString();
    }

    if (body === undefined || body === null) {
      return undefined;
    }

    const isFormUrlEncoded = contentType?.includes('application/x-www-form-urlencoded');

    // 2. Content-Type が application/x-www-form-urlencoded の場合
    if (isFormUrlEncoded) {
      if (typeof body === 'object') {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined && v !== null) {
            params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
          }
        }
        return params.toString();
      }

      if (typeof body === 'string') {
        const trimmed = body.trim();
        // JSON文字列として渡された場合はパースしてURLSearchParamsに変換
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
              const params = new URLSearchParams();
              for (const [k, v] of Object.entries(parsed)) {
                if (v !== undefined && v !== null) {
                  params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                }
              }
              return params.toString();
            }
          } catch {
            // パース失敗時はそのまま扱う
          }
        }
        return body;
      }
    }

    // 3. 通常のJSONまたはテキスト
    if (typeof body === 'string') {
      return body;
    }

    return JSON.stringify(body);
  }
}

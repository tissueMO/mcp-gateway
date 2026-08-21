/**
 * ターゲット設定の型定義。
 */
export interface TargetConfig {
  /** ターゲットのBase URL */
  baseUrl: string;
  /** デフォルトのリクエストヘッダー */
  defaultHeaders?: Record<string, string>;
  /** 許可されているHTTPメソッドの一覧 */
  allowedMethods?: string[];
}

/**
 * 全ターゲット設定のマップ型定義。
 */
export type TargetsMap = Record<string, TargetConfig>;

/**
 * API呼び出しリクエストの引数型。
 */
export interface CallApiArgs {
  /** 接続先ターゲット名（例: IFTTT, HomeServer） */
  target: string;
  /** 相対パス（例: /busy/turn?id=101） */
  path?: string;
  /** HTTPメソッド */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 追加のリクエストヘッダー */
  headers?: Record<string, string>;
  /** クエリーパラメーター */
  query?: Record<string, string>;
  /** リクエストボディ */
  body?: any;
}

/**
 * API呼び出しレスポンス型。
 */
export interface CallApiResponse {
  /** HTTPステータスコード */
  status: number;
  /** レスポンスヘッダー */
  headers: Record<string, string>;
  /** レスポンスボディ */
  data: any;
}

/**
 * 環境変数の型定義。
 */
export interface AppEnvironment {
  COGNITO_USER_POOL_ID?: string;
  COGNITO_DOMAIN?: string;
  AWS_REGION?: string;
  CUSTOM_DOMAIN?: string;
  TARGETS_PARAMETER_NAME?: string;
}

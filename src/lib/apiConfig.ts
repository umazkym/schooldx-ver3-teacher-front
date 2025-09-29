// 環境変数を読み込み、本番環境で http が指定されていても https に強制変換する
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * アプリケーション全体で使用するAPIのベースURL。
 * Mixed Contentエラーを回避するため、http:// で始まるURLは https:// に変換されます。
 */
export const apiBaseUrl = rawApiBaseUrl.includes('localhost') 
  ? rawApiBaseUrl 
  : rawApiBaseUrl.replace(/^http:/, 'https:');
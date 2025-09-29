// 環境変数を読み込みます。
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * アプリケーション全体で使用するAPIのベースURL。
 * Mixed Contentエラーを回避するため、本番環境（URLに'localhost'を含まない場合）では、
 * プロトコルを常に'https'に変換します。
 */
let finalApiBaseUrl = rawApiBaseUrl;

// 'localhost'を含まないURL（本番環境と想定）の場合、プロトコルを確認・修正します。
if (rawApiBaseUrl && !rawApiBaseUrl.includes('localhost')) {
  try {
    // URLオブジェクトを使用して、安全にプロトコルを'https:'に設定します。
    const url = new URL(rawApiBaseUrl);
    url.protocol = 'https:';
    finalApiBaseUrl = url.toString();

    // URLオブジェクトが末尾にスラッシュを追加する場合があるため、削除します。
    if (finalApiBaseUrl.endsWith('/')) {
      finalApiBaseUrl = finalApiBaseUrl.slice(0, -1);
    }
  } catch (e) {
    // 環境変数のURLが不正な形式だった場合のエラーハンドリング
    console.error("無効なNEXT_PUBLIC_API_BASE_URLです:", rawApiBaseUrl, e);
    // エラーが発生した場合は、元の値をそのまま使用します（問題の切り分けのため）。
    finalApiBaseUrl = rawApiBaseUrl;
  }
}

export const apiBaseUrl = finalApiBaseUrl;
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

console.log("環境変数から読み込んだURL:", rawApiBaseUrl); // デバッグ用

let finalApiBaseUrl = rawApiBaseUrl;

// すべてのURLでhttpsに強制変換（localhost以外）
if (rawApiBaseUrl) {
  if (rawApiBaseUrl.includes('localhost') || rawApiBaseUrl.includes('127.0.0.1')) {
    finalApiBaseUrl = rawApiBaseUrl; // localhostはそのまま
  } else {
    try {
      const url = new URL(rawApiBaseUrl.startsWith('http') ? rawApiBaseUrl : `https://${rawApiBaseUrl}`);
      url.protocol = 'https:';
      finalApiBaseUrl = url.toString().replace(/\/$/, '');
    } catch (e) {
      console.error("無効なURL:", rawApiBaseUrl, e);
    }
  }
}

console.log("最終的なAPIベースURL:", finalApiBaseUrl); // デバッグ用

export const apiBaseUrl = finalApiBaseUrl;
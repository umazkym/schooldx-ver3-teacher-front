// src/lib/apiConfig.ts
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// ▼▼▼ デバッグ用ログ追加 ▼▼▼
if (typeof window !== 'undefined') {
  console.log('=== API Config Debug ===');
  console.log('Raw API Base URL:', rawApiBaseUrl);
  console.log('Environment:', process.env.NODE_ENV);
}
// ▲▲▲ デバッグ用ログ追加 ▲▲▲

let finalApiBaseUrl = rawApiBaseUrl;

if (rawApiBaseUrl && !rawApiBaseUrl.includes('localhost')) {
  try {
    const url = new URL(rawApiBaseUrl);
    url.protocol = 'https:';
    finalApiBaseUrl = url.toString();
    if (finalApiBaseUrl.endsWith('/')) {
      finalApiBaseUrl = finalApiBaseUrl.slice(0, -1);
    }
    
    // ▼▼▼ デバッグ用ログ追加 ▼▼▼
    if (typeof window !== 'undefined') {
      console.log('Final API Base URL:', finalApiBaseUrl);
    }
    // ▲▲▲ デバッグ用ログ追加 ▲▲▲
  } catch (e) {
    console.error("無効なNEXT_PUBLIC_API_BASE_URLです:", rawApiBaseUrl, e);
    finalApiBaseUrl = rawApiBaseUrl;
  }
}

export const apiBaseUrl = finalApiBaseUrl;
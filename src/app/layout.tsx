import './globals.css'
import React from 'react'
import Header from './components/header'
import Sidebar from './components/sidebar'

export const metadata = {
  title: 'School App',
  description: 'School management UI sample',
}

/**
 * すべてのページをラップするルートレイアウト
 * - ヘッダーを上部
 * - サイドバーを左
 * - メインコンテンツを右
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="flex flex-col min-h-screen">
        {/* ヘッダー: ページタイトル＋校章 */}
        <Header />

        {/* ページごとのメインレイアウト */}
        <div className="flex flex-1">
          {/* サイドバー: ページパスに応じて動的にメニューを出し分け */}
          <Sidebar />

          <main className="flex-1 p-6 bg-white overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}

import './globals.css'
import React from 'react'
import Header from './components/header'
import Sidebar from './components/sidebar'

export const metadata = {
  title: 'School App',
  description: 'School management UI sample',
}

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
        <div className="flex flex-1">
          <Sidebar />

          <main className="flex-1 p-6 bg-white overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}

"use client"
import React from 'react'
import Link from 'next/link'

export default function ContentsManagementPage() {
  const handleBack = () => {
    history.back()
  }

  return (
    <div>
      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button
            onClick={handleBack}
            className="font-bold hover:underline mr-4"
          >
            &lt; 戻る
          </button>
        </div>
        <div
          className="border border-blue-100 bg-blue-50 py-2 px-4 rounded text-gray-700 text-center"
          style={{ minWidth: '700px' }}
        >
          コンテンツを登録する学年・科目を選択してください
        </div>
      </div>

      {/* 学年＆科目一覧 */}
      <div className="space-y-8">
        {/* 高校1年生 */}
        <div className="bg-gray-100 p-4 rounded">
          <div className="text-lg mb-2">高校1年生</div>
          <Link href="/contents-management/curriculum" passHref>
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              物理基礎
            </button>
          </Link>
        </div>

        {/* 高校2年生 */}
        <div className="bg-gray-100 p-4 rounded">
          <div className="text-lg mb-2">高校2年生</div>
          <Link href="/contents-management/curriculum" passHref>
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              物理
            </button>
          </Link>
        </div>

        {/* 高校3年生 */}
        <div className="bg-gray-100 p-4 rounded">
          <div className="text-lg mb-2">高校3年生</div>
          <Link href="/contents-management/curriculum" passHref>
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              物理
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}

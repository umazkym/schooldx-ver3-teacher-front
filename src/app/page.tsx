import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import contentsIcon from './icons/contents.png'
import classroomIcon from './icons/classroom.png'
import dashboardIcon from './icons/dashboard.png'

/**
 * ホームメニュー画面
 * ・「使用する機能を選択してください」を上部に表示
 * ・4つのカードに影をつける（成績表示を追加）
 */
export default function HomePage() {
  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold mb-4">使用する機能を選択してください</h1>
      <div className="flex gap-8 flex-wrap">
        
        {/* コンテンツ登録/管理 */}
        <Link href="/contents-management" className="text-center">
          <div
            className="
              w-48 h-56
              border border-gray-200
              rounded-lg
              flex flex-col items-center justify-center
              bg-white
              shadow-sm hover:shadow-md
              transition-shadow
            "
          >
            <Image
              src={contentsIcon}
              alt="コンテンツ登録 / 管理"
              width={80}
              height={80}
              className="mb-2"
            />
            <div className="text-sm font-medium">
              コンテンツ登録 / 管理
            </div>
          </div>
        </Link>

        {/* 授業登録 */}
        <Link href="/class-registration" className="text-center">
          <div
            className="
              w-48 h-56
              border border-gray-200
              rounded-lg
              flex flex-col items-center justify-center
              bg-white
              shadow-sm hover:shadow-md
              transition-shadow
            "
          >
            <Image
              src={classroomIcon}
              alt="授業登録"
              width={80}
              height={80}
              className="mb-2"
            />
            <div className="text-sm font-medium">
              授業登録
            </div>
          </div>
        </Link>

        {/* リアルタイムダッシュボード */}
        <Link href="/realtime-dashboard" className="text-center">
          <div
            className="
              w-48 h-56
              border border-gray-200
              rounded-lg
              flex flex-col items-center justify-center
              bg-white
              shadow-sm hover:shadow-md
              transition-shadow
            "
          >
            <Image
              src={dashboardIcon}
              alt="リアルタイムダッシュボード"
              width={80}
              height={80}
              className="mb-2"
            />
            <div className="text-sm font-medium">
              リアルタイムダッシュボード
            </div>
          </div>
        </Link>

        {/* 成績表示（新規追加） */}
        <Link href="/grades" className="text-center">
          <div
            className="
              w-48 h-56
              border border-gray-200
              rounded-lg
              flex flex-col items-center justify-center
              bg-white
              shadow-sm hover:shadow-md
              transition-shadow
            "
          >
            <div className="text-4xl mb-2">📊</div>
            <div className="text-sm font-medium">
              成績表示
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
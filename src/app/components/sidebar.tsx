"use client"
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TiHome } from 'react-icons/ti'
import { AiFillBook } from 'react-icons/ai'
import { RiQuestionFill } from 'react-icons/ri'

/**
 * ページパスに応じて、サイドバーに表示するメニューを切り替える。
 * - ホームメニュー (/): ホームボタンのみ
 * - カレンダビュー (/realtime-dashboard): ホームのみ
 * - 授業コンテンツ選択 (/realtime-dashboard/content-selection): ホーム + コンテンツ管理・登録(2行表示)
 * - ダッシュボード (/realtime-dashboard/dashboard): ホーム + 質問一覧
 * - 質問一覧 (/realtime-dashboard/questions-list): ホームのみ
 * - 授業登録関連 (/class-registration...): ホーム + コンテンツ管理・登録(2行表示)
 */
export default function Sidebar() {
  const pathname = usePathname()

  const isContentSelection = pathname.startsWith('/realtime-dashboard/content-selection')
  const isDashboard = pathname.startsWith('/realtime-dashboard/dashboard')
  
  // 新たに: /class-registration の場合にコンテンツ管理ボタンを追加
  const isClassRegistration = pathname.startsWith('/class-registration/final')

  // 1) 常にホームボタン
  const menus: { label: string; href: string; icon: React.ReactNode }[] = [
    {
      label: 'ホーム',
      href: '/',
      icon: <TiHome size={36} className="text-[#285AC8]" />,
    },
  ]

  // 2) コンテンツ選択画面: + コンテンツ管理・登録(2行)
  if (isContentSelection) {
    menus.push({
      label: 'コンテンツ\n管理・登録',
      href: '/contents-management',
      icon: <AiFillBook size={36} className="text-[#285AC8]" />,
    })
  }

  // 3) ダッシュボード画面: + 質問一覧
  if (isDashboard) {
    menus.push({
      label: '質問一覧',
      href: '/realtime-dashboard/questions-list',
      icon: <RiQuestionFill size={36} className="text-[#285AC8]" />,
    })
  }

  // 4) 授業登録画面 (/class-registration): コンテンツ管理・登録
  if (isClassRegistration) {
    menus.push({
      label: 'コンテンツ\n管理・登録',
      href: '/contents-management',
      icon: <AiFillBook size={36} className="text-[#285AC8]" />,
    })
  }

  return (
    <nav
      className="
        w-20
        bg-[#E9F1FF]
        border-r border-gray-200
        flex flex-col
        items-center
        pt-4
      "
    >
      {menus.map((m, idx) => (
        <Link
          key={idx}
          href={m.href}
          className="flex flex-col items-center mb-12 group"
        >
          <div className="group-hover:text-blue-500 whitespace-pre leading-tight text-center">
            {m.icon}
          </div>
          <span className="text-xs text-[#285AC8] group-hover:text-blue-500 whitespace-pre leading-tight text-center mt-1">
            {m.label}
          </span>
        </Link>
      ))}
    </nav>
  )
}

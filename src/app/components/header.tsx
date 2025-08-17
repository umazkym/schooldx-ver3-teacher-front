"use client"
import React from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import Emblem from "../icons/emblem.jpg"

/**
 * ヘッダー上部。
 * ページに応じたタイトルを左に表示。
 * 右側に学校名＋校章(emblem.jpg)を表示。
 */
export default function Header() {
  const pathname = usePathname()

  let pageTitle = ""
  if (pathname === "/") {
    pageTitle = "ホームメニュー"
  } else if (pathname.startsWith("/realtime-dashboard")) {
    pageTitle = "リアルタイムダッシュボード"
  } else if (pathname.startsWith("/contents-management")) {
    pageTitle = "コンテンツ管理 / 登録"
  } else if (pathname.startsWith("/class-registration")) {
    pageTitle = "授業登録"
  }

  return (
    <header
      className="
        w-full h-16
        flex items-center justify-between
        px-6
        border-b border-gray-200
        bg-white
      "
    >
      {/* ページタイトル */}
      <div className="text-lg font-bold">{pageTitle}</div>

      {/* 学校名＋校章 */}
      <div className="flex items-center gap-2">
        <span className="text-sm">下妻第一高校</span>
        {/**
         * Next.js の画像周りの警告を抑えるために:
         * 1) priority
         * 2) width/height と同時に style={{ width:"auto", height:"auto" }} などでアスペクト比を守る
         */}
        <Image
          src={Emblem}
          alt="校章"
          width={40}
          height={40}
          priority
          style={{ width: "auto", height: "auto" }}
          className="rounded-full"
        />
      </div>
    </header>
  )
}
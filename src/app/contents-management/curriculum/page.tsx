"use client"
import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { AiFillFolder } from "react-icons/ai"

/**
 * 要件:
 * 1. 左側の階層は /content/by_id/1 で取得したデータを反映 (part_name, chapter_name, unit_name)
 * 2. 左で選択したユニットを、右上の階層表示 (part_name > chapter_name > unit_name) に反映
 * 3. 右側のテーブルは、選択したユニットの lesson_themes を行として表示
 * - テーマ列 => lesson_theme_name
 * - 講義動画 => /lecture_videos を参照し、あれば「登録済」、なければ「未登録」
 * - 登録済なら「表示」ボタンと「削除」ボタン
 * - 未登録ならファイル選択ボタン (POST /lecture_videos)
 * - テキスト・参考資料・演習問題は全て「登録済」で固定
 * 4. 講義動画の削除 => DELETE /lecture_videos/{lecture_video_id}
 * 5. 講義動画のアップロード => POST /lecture_videos (multipart/form-data)
 * - 既に登録済みなら400エラー→「削除してから再登録して下さい」メッセージなど
 */

type LessonThemeFromContent = {
  lesson_theme_id: number
  lesson_theme_name: string
}

type UnitItemFromContent = {
  units_id: number
  material_id: number
  part_name: string
  chapter_name: string
  unit_name: string
  lesson_themes: LessonThemeFromContent[]
}

/** /lecture_videos のレスポンス用 */
type LectureVideo = {
  lecture_video_id: number
  lesson_theme_id: number
  lecture_video_title: string
  video_url: string
}

/** * 階層表示用: part -> chapter -> units[]
 */
type ChapterGroup = {
  chapter_name: string
  units: UnitItemFromContent[]
}

type PartGroup = {
  part_name: string
  chapters: ChapterGroup[]
}

export default function CurriculumPage() {

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  // =========================
  // State
  // =========================
  /** parts: part_name -> chapters -> units */
  const [parts, setParts] = useState<PartGroup[]>([])
  /** unitのIDからUnitItemへアクセスするマップ */
  const [unitMap, setUnitMap] = useState<Record<number, UnitItemFromContent>>({})
  /** /lecture_videos (GET) で取得した配列 */
  const [lectureVideos, setLectureVideos] = useState<LectureVideo[]>([])
  /** 現在選択中のユニットID */
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  /** 通信中やエラー管理 */
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  // =========================
  // 初期Fetch
  // =========================
  const fetchAllData = useCallback(async () => {
    if (!apiBaseUrl) {
      setError("APIのベースURLが設定されていません。");
      return;
    }
    setError("")
    try {
      // 1) /content/by_id/1 (GET)
      const contentRes = await fetch(
        `${apiBaseUrl}/content/by_id/1`,
        {
          method: "GET",
          mode: "cors",
          redirect: "follow",
        }
      )
      if (!contentRes.ok) {
        throw new Error(`Failed to fetch content: ${contentRes.status}`)
      }
      const contentData: UnitItemFromContent[] = await contentRes.json()

      // 2) /lecture_videos (GET)
      const lectureRes = await fetch(
        `${apiBaseUrl}/lecture_videos/`,
        {
          method: "GET",
          mode: "cors",
          redirect: "follow",
        }
      )
      if (!lectureRes.ok) {
        throw new Error(`Failed to fetch lecture_videos: ${lectureRes.status}`)
      }
      const lectureData: LectureVideo[] = await lectureRes.json()

      // 整形
      const groupedParts = groupByPartChapter(contentData)
      setParts(groupedParts)

      const mapObj: Record<number, UnitItemFromContent> = {}
      contentData.forEach((u) => {
        mapObj[u.units_id] = u
      })
      setUnitMap(mapObj)

      setLectureVideos(lectureData)

      // デフォルト選択
      if (groupedParts.length > 0) {
        const firstPart = groupedParts[0]
        if (firstPart.chapters.length > 0) {
          const firstChap = firstPart.chapters[0]
          if (firstChap.units.length > 0) {
            setSelectedUnitId(firstChap.units[0].units_id)
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // -----------------------------
  // part->chapter->units の階層化
  // -----------------------------
  function groupByPartChapter(allUnits: UnitItemFromContent[]): PartGroup[] {
    const partMap = new Map<string, Map<string, UnitItemFromContent[]>>()
    for (const u of allUnits) {
      if (!partMap.has(u.part_name)) {
        partMap.set(u.part_name, new Map())
      }
      const chapterMap = partMap.get(u.part_name)!
      if (!chapterMap.has(u.chapter_name)) {
        chapterMap.set(u.chapter_name, [])
      }
      chapterMap.get(u.chapter_name)!.push(u)
    }
    const result: PartGroup[] = []
    for (const [pName, chMap] of partMap.entries()) {
      const chapters: ChapterGroup[] = []
      for (const [cName, unitsArr] of chMap.entries()) {
        chapters.push({
          chapter_name: cName,
          units: unitsArr,
        })
      }
      result.push({
        part_name: pName,
        chapters,
      })
    }
    return result
  }

  // ユニット選択
  function handleUnitClick(unitId: number) {
    setSelectedUnitId(unitId)
  }

  // 講義動画検索
  function findLectureVideoByThemeId(themeId: number): LectureVideo | undefined {
    return lectureVideos.find((v) => v.lesson_theme_id === themeId)
  }

  // =========================
  // 動画アップロード (POST)
  // =========================
  async function handleUploadVideo(themeId: number, file: File) {
    if (!apiBaseUrl) {
      alert("APIのベースURLが設定されていません。");
      return;
    }
    try {
      setError("")
      setUploading(true)
      // ファイルのみ FormData に追加
      const formData = new FormData()
      formData.append("file", file)
  
      // lesson_theme_id はクエリパラメータとして付与
      const url = `${apiBaseUrl}/lecture_videos/?lesson_theme_id=${themeId}`
  
      const res = await fetch(url, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        body: formData,
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`POST failed: ${res.status}, ${msg}`)
      }
      // 成功 → 再取得
      await fetchAllData()
    } catch (err) {
      console.error(err)
      alert(`アップロード失敗: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }
  

  // =========================
  // 動画削除 (DELETE)
  // =========================
  async function handleDeleteVideo(video: LectureVideo) {
    if (!apiBaseUrl) {
      alert("APIのベースURLが設定されていません。");
      return;
    }
    try {
      setError("")
      setDeleting(true)
      const res = await fetch(
        `${apiBaseUrl}/lecture_videos/${video.lecture_video_id}`,
        {
          method: "DELETE",
          mode: "cors",
          redirect: "follow",
        }
      )
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`DELETE failed: ${res.status}, ${msg}`)
      }
      // 成功 → 再取得
      await fetchAllData()
    } catch (err) {
      console.error(err)
      alert(`削除失敗: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  // =========================
  // JSX
  // =========================
  const selectedUnit = selectedUnitId ? unitMap[selectedUnitId] : null

  return (
    <div className="flex">
      {/* 左側ツリー */}
      <div className="w-64 border-r border-gray-200 pr-2">
        <h2 className="font-bold text-lg mb-2">高校1年生・物理基礎</h2>
        {error && (
          <div className="text-red-500 mb-2 whitespace-pre-wrap">{error}</div>
        )}
        {parts.length === 0 && !error && (
          <p className="text-gray-500">読み込み中です。</p>
        )}
        {parts.map((p) => (
          <div key={p.part_name} className="mb-2">
            <div className="text-sm font-bold mb-1">{p.part_name}</div>
            {p.chapters.map((ch) => (
              <div key={ch.chapter_name} className="ml-4 mb-2">
                <div className="text-sm font-semibold mb-1">{ch.chapter_name}</div>
                <div className="ml-4">
                  {ch.units.map((u) => {
                    const isSelected = u.units_id === selectedUnitId
                    return (
                      <div
                        key={u.units_id}
                        className="flex items-center mb-1 cursor-pointer"
                        onClick={() => handleUnitClick(u.units_id)}
                      >
                        <AiFillFolder style={{ color: "#FFB700" }} className="mr-1" />
                        <span className={isSelected ? "font-bold" : ""}>
                          {u.unit_name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 右テーブル */}
      <div className="flex-1 ml-4">
        {selectedUnit ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-md">
                {selectedUnit.part_name} &gt; {selectedUnit.chapter_name} &gt; {selectedUnit.unit_name}
              </h2>
              <Link
                href="/class-registration"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                授業登録へ
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 text-sm table-fixed">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 border-r border-gray-200 w-1/6">テーマ</th>
                    <th className="p-2 border-r border-gray-200 w-1/6">講義動画</th>
                    <th className="p-2 border-r border-gray-200 w-1/6">テキスト</th>
                    <th className="p-2 border-r border-gray-200 w-1/6">参考資料</th>
                    <th className="p-2 w-1/6">演習問題</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUnit.lesson_themes.map((theme) => {
                    const video = findLectureVideoByThemeId(theme.lesson_theme_id)
                    const isRegistered = !!video
                    return (
                      <tr key={theme.lesson_theme_id}>
                        <td className="p-2 border-b border-gray-200 border-r text-center">
                          {theme.lesson_theme_name}
                        </td>

                        {/* 講義動画 */}
                        <td className="p-2 border-b border-gray-200 border-r">
                          {isRegistered ? (
                            <>
                              <div className="text-left text-blue-700 font-semibold mb-1">
                                登録済
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                                  onClick={() => {
                                    if (video) {
                                      window.open(video.video_url, "_blank")
                                    }
                                  }}
                                >
                                  表示
                                </button>
                                <button
                                  className="bg-gray-300 px-3 py-1 rounded text-gray-700 hover:bg-red-200"
                                  disabled={deleting}
                                  onClick={() => {
                                    if (!video) return
                                    if (
                                      confirm(`動画「${video.lecture_video_title}」を削除しますか？`)
                                    ) {
                                      handleDeleteVideo(video)
                                    }
                                  }}
                                >
                                  削除
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-gray-400 mb-1">未登録</div>
                              <input
                                type="file"
                                disabled={uploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    handleUploadVideo(theme.lesson_theme_id, file)
                                  }
                                }}
                              />
                            </>
                          )}
                        </td>

                        {/* テキスト (登録済固定) */}
                        <td className="p-2 border-b border-gray-200 border-r">
                          <div className="text-left text-blue-700 font-semibold mb-1">
                            登録済
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                              表示
                            </button>
                            <button className="bg-gray-300 px-3 py-1 rounded text-gray-700 hover:bg-red-200">
                              削除
                            </button>
                          </div>
                        </td>

                        {/* 参考資料 (登録済固定) */}
                        <td className="p-2 border-b border-gray-200 border-r">
                          <div className="text-left text-blue-700 font-semibold mb-1">
                            登録済
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                              表示
                            </button>
                            <button className="bg-gray-300 px-3 py-1 rounded text-gray-700 hover:bg-red-200">
                              削除
                            </button>
                          </div>
                        </td>

                        {/* 演習問題 (登録済固定) */}
                        <td className="p-2 border-b border-gray-200">
                          <div className="text-left text-blue-700 font-semibold mb-1">
                            登録済
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                              表示
                            </button>
                            <button className="bg-gray-300 px-3 py-1 rounded text-gray-700 hover:bg-red-200">
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-gray-500">ユニットを選択してください</p>
        )}
      </div>
    </div>
  )
}
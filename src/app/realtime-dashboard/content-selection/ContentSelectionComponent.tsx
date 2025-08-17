"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

export default function ContentSelectionComponent() {
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const searchParams = useSearchParams();
  const lessonIdStr = searchParams.get("lesson_id");
  const lessonId   = lessonIdStr ? Number(lessonIdStr) : null;

  /** ───────── API 型定義 ───────── */
  // 授業テーマの型
  interface LessonThemeBlock {
    lesson_registration_id: number;
    lesson_theme_id: number;
    lecture_video_id: number;
    textbook_id: number;
    document_id: number;
    lesson_theme_name: string;
    units_id: number;
    part_name: string | null;
    chapter_name: string | null;
    unit_name: string | null;
    material_id: number;
    material_name: string;
  }

  // APIレスポンス全体の型
  interface LessonApiResponse {
    class_id: number;
    timetable_id: number;
    lesson_name: string | null;
    delivery_status: boolean;
    lesson_status: boolean;
    date: string;
    day_of_week: string;
    period: number;
    time: string;
    lesson_theme: LessonThemeBlock[];
  }

  // テーブル表示用の行データ型
  type ContentRow = {
    id: number;
    no: string;
    textbook: string;
    hen: string;
    chapter: string;
    unit: string;
    theme: string;
    time: string;
  };

  const [lessonInfo, setLessonInfo] = useState<LessonApiResponse | null>(null);
  const [contents,   setContents]   = useState<ContentRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    (async () => {
      try {
        const res  = await fetch(
          `${apiBaseUrl}/lesson_attendance/lesson_information?lesson_id=${lessonId}`
        );
        if (!res.ok) throw new Error(`GET lesson_information failed: ${res.status}`);

        const data = (await res.json()) as LessonApiResponse;
        setLessonInfo(data);

        const themes = data.lesson_theme || [];
        setContents(
          themes.map((t, idx): ContentRow => ({
            id:       t.lesson_theme_id,
            no:       `No.${idx + 1}`,
            textbook: t.material_name,
            hen:      t.part_name     ?? "",
            chapter:  t.chapter_name  ?? "",
            unit:     t.unit_name     ?? "",
            theme:    t.lesson_theme_name,
            time:     "–",
          }))
        );
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  const handleStartLesson = async () => {
    if (!contents || contents.length === 0) {
      alert("開始するコンテンツがありません。");
      return;
    }
    if (!lessonId) {
      alert("lesson_id が見つかりません。");
      return;
    }

    setIsStarting(true);
    const successThemes: string[] = [];
    const errorThemes: string[] = [];

    await Promise.all(
      contents.map(async (content) => {
        try {
          const res = await fetch(`${apiBaseUrl}/api/answer-data-bulk/lessons/${lessonId}/themes/${content.id}/generate-answer-data`, {
            method: "POST",
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(errorData.detail || `HTTP error ${res.status}`);
          }
          await res.json();
          successThemes.push(content.theme);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          errorThemes.push(`「${content.theme}」（${errorMessage}）`);
        }
      })
    );

    let alertMessage = "";
    if (successThemes.length > 0) {
        alertMessage += `${successThemes.length}個のテーマで授業を開始しました。\n`;
    }
    if (errorThemes.length > 0) {
        alertMessage += `\n以下のテーマでエラーが発生しました:\n${errorThemes.join("\n")}\n\n※テーマに問題が登録されていない可能性があります。`;
    }
    alert(alertMessage || "処理が完了しましたが、予期せぬ状態です。");

    setIsStarting(false);
  };


  if (!lessonId)          return <p>lesson_id がありません。</p>;
  if (loading || !lessonInfo) return <p>Loading...</p>;

  const dateInfoQuery =
    `${lessonInfo.date} (${lessonInfo.day_of_week}) / ` +
    `${lessonInfo.period}限目 ${lessonInfo.lesson_name ?? ""}`;

  return (
    <div>
      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/realtime-dashboard" className="font-bold hover:underline mr-4">
            &lt; 戻る
          </Link>
          <span className="text-xl font-bold">授業コンテンツ選択</span>
        </div>
        <div
          className="border border-blue-100 bg-blue-50 py-2 px-4 rounded text-gray-700 text-center"
          style={{ minWidth: "700px" }}
        >
          開始するコンテンツを選択してください
        </div>
      </div>

      {/* 日付/時限/クラス等 */}
      <div className="text-gray-600 mb-4">{dateInfoQuery}</div>

      {/* ボタン類 */}
      <div className="flex justify-end gap-2 mb-4">
        <button className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
          予習配信
        </button>
        <button
          className={`bg-blue-500 text-white px-3 py-1 rounded ${isStarting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
          onClick={handleStartLesson}
          disabled={isStarting}
        >
          {isStarting ? "開始処理中..." : "授業開始"}
        </button>
        <button className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600">
          授業終了
        </button>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="border border-gray-200 text-sm text-center w-full table-fixed">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border-b border-gray-200 w-1/8">コンテンツNo.</th>
              <th className="p-2 border-b border-gray-200 w-1/8">教科書</th>
              <th className="p-2 border-b border-gray-200 w-1/8">編</th>
              <th className="p-2 border-b border-gray-200 w-1/8">章</th>
              <th className="p-2 border-b border-gray-200 w-1/8">単元</th>
              <th className="p-2 border-b border-gray-200 w-1/8">テーマ</th>
              <th className="p-2 border-b border-gray-200 w-1/8">目安演習時間(分)</th>
              <th className="p-2 border-b border-gray-200 w-1/8">授業ダッシュボード選択</th>
            </tr>
          </thead>
          <tbody>
            {contents.map((c) => (
              <tr key={c.id}>
                <td className="p-2 border-b border-gray-200">{c.no}</td>
                <td className="p-2 border-b border-gray-200">{c.textbook}</td>
                <td className="p-2 border-b border-gray-200">{c.hen}</td>
                <td className="p-2 border-b border-gray-200">{c.chapter}</td>
                <td className="p-2 border-b border-gray-200">{c.unit}</td>
                <td className="p-2 border-b border-gray-200">{c.theme}</td>
                <td className="p-2 border-b border-gray-200">{c.time}</td>
                <td className="p-2 border-b border-gray-200">
                  <button
                    className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                    onClick={() => {
                      sessionStorage.setItem(
                        "selectedContentInfo",
                        JSON.stringify({
                          lesson_theme_id:   c.id,
                          lesson_theme_name: c.theme,
                          material_name:     c.textbook,
                          part_name:         c.hen,
                          chapter_name:      c.chapter,
                          unit_name:         c.unit,
                        })
                      );
                      if (lessonInfo) {
                        sessionStorage.setItem(
                          "selectedLessonMeta",
                          JSON.stringify({
                            date:        lessonInfo.date,
                            day_of_week: lessonInfo.day_of_week,
                            period:      lessonInfo.period,
                            lesson_name: lessonInfo.lesson_name,
                          })
                        );
                      }
                      const q = new URLSearchParams({
                        timer:     c.time,
                        lesson_id: lessonIdStr ?? "",
                      });
                      router.push(`/realtime-dashboard/dashboard?${q.toString()}`);
                    }}
                  >
                    ダッシュボードへ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
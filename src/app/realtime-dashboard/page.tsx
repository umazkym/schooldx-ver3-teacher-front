"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { addMonths, subMonths, format, getDay } from "date-fns";
import { useRouter } from "next/navigation";

/**
 * リアルタイムダッシュボード ＞ カレンダビュー
 * - 「授業登録」と同じUIレイアウトで、左に「月カレンダー」(前の月/次の月ボタン)、
 * 右に「選択週(月~金)」の時間割を表示。
 * - "開始する授業を選択してください" の文言を上に表示。
 * - 時間割クリック時に `/realtime-dashboard/content-selection` へ遷移し、クエリに dateInfo を付与。
 * - ダミーデータ: 2/15 ~ 3/31 にだけ授業がある。
 */

export default function RealtimeDashboardCalendarPage() {
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  // 今日
  const today = new Date();

  // 月カレンダーの状態
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-based
  // 選択した日付 (週表示用): 初期値=今日
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  // 前の月へ
  const handlePrevMonth = () => {
    const base = new Date(currentYear, currentMonth, 1);
    const prev = subMonths(base, 1);
    setCurrentYear(prev.getFullYear());
    setCurrentMonth(prev.getMonth());
  };
  // 次の月へ
  const handleNextMonth = () => {
    const base = new Date(currentYear, currentMonth, 1);
    const next = addMonths(base, 1);
    setCurrentYear(next.getFullYear());
    setCurrentMonth(next.getMonth());
  };

  // 指定年月の1日～末日を列挙
  function getDaysInMonth(year: number, month: number): Date[] {
    const first = new Date(year, month, 1);
    const arr: Date[] = [];
    while (first.getMonth() === month) {
      arr.push(new Date(first));
      first.setDate(first.getDate() + 1);
    }
    return arr;
  }
  const daysInThisMonth = getDaysInMonth(currentYear, currentMonth);

  // 日付クリック => selectedDate を変更
  function handleSelectDate(d: Date) {
    setSelectedDate(d);
  }

  // 選択日の「週」(月曜始まりで5日分)
  function getWeekDates(date: Date) {
    const wd = getDay(date); // 0=日,1=月,...6=土
    const mondayOffset = wd === 0 ? 6 : wd - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - mondayOffset);

    const result: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      result.push(dd);
    }
    return result;
  }
  const weekDates = getWeekDates(selectedDate);

  // 時限(2行表示: 例 "1限\n8:35~9:30")
  const periods = [
    { period: 1, label: "1限\n8:35~9:30" },
    { period: 2, label: "2限\n9:40~10:35" },
    { period: 3, label: "3限\n10:45~11:40" },
    { period: 4, label: "4限\n12:25~13:20" },
    { period: 5, label: "5限\n13:30~14:25" },
    { period: 6, label: "6限\n14:35~15:30" },
  ];

  /**
   * ────────────────
   * ①  カレンダーAPI取得
   * ────────────────
   */
  interface LessonCalendarEntry {
    timetable_id: number;
    date: string;
    day_of_week: string;
    period: number;
    time: string;
    lesson_id: number | null;
    class_id: number;
    lesson_name: string | null;
    delivery_status: boolean;
    lesson_status: boolean;
  }

  const [scheduleEntries, setScheduleEntries] = useState<LessonCalendarEntry[]>([]);

  useEffect(() => {
    if (!apiBaseUrl) {
      console.error("APIのベースURLが設定されていません。");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/lesson_attendance/calendar`,
          { method: "GET" }
        );
        if (!res.ok) throw new Error(`GET calendar failed: ${res.status}`);
        setScheduleEntries(await res.json());
      } catch (e) {
        console.error(e);
      }
    })();
  }, [apiBaseUrl]);

  /**
   * ────────────────
   * ②  日付×時限マップ生成
   * ────────────────
   */
  const scheduleMap = useMemo(() => {
    const map: Record<
      string,
      Array<{
        lessonName: string;
        classId: number | null;
        lessonId: number | null;   // ★ 追加
      } | null>
    > = {};
    scheduleEntries.forEach((e) => {
      const key = e.date.replace(/-/g, "/");
      if (!map[key]) map[key] = [null, null, null, null, null, null];
      map[key][e.period - 1] = {
        lessonName: e.lesson_name ?? "物理",
        classId: e.class_id ?? null,
        lessonId: e.lesson_id,          // ← 型に合わせて保持
      };
    });
    return map;
  }, [scheduleEntries]);

  // 時間割セルをクリック => content-selection へ
function handleClickSchedule(
  dateObj: Date,
  period: number,
  info: { lessonName: string; classId: number | null; lessonId: number | null }
) {
    if (!info.lessonId) return;         // lesson 未登録コマ

    // クリック先ページは lesson_id のみを渡す（他の表示情報は API 側で取得）
    router.push(`/realtime-dashboard/content-selection?lesson_id=${info.lessonId}`);
  }

  return (
    <div>
      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="font-bold hover:underline mr-4">
            &lt; 戻る
          </Link>
        </div>
        <div
          className="border border-blue-100 bg-blue-50 py-2 px-4 rounded text-gray-700 text-center"
          style={{ minWidth: "700px" }}
        >
          開始する授業を選択してください
        </div>
      </div>

      <div className="flex gap-8">
        {/* 左: 月カレンダー */}
        <div>
          {/* 年月切り替え */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={handlePrevMonth} className="text-[#5E5E5E] font-bold hover:underline">
              &lt; 前の月
            </button>
            <div className="font-semibold text-[#5E5E5E]">
              {currentYear}年 {currentMonth + 1}月
            </div>
            <button onClick={handleNextMonth} className="text-[#5E5E5E] font-bold hover:underline">
              次の月 &gt;
            </button>
          </div>

          {/* カレンダー (7列) */}
          <div className="grid grid-cols-7 gap-2 p-2 border border-gray-300 rounded">
            {daysInThisMonth.map((d) => {
              const dayNum = d.getDate();
              const isToday =
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                dayNum === today.getDate();
              const isSelected =
                d.getFullYear() === selectedDate.getFullYear() &&
                d.getMonth() === selectedDate.getMonth() &&
                dayNum === selectedDate.getDate();

              return (
                <button
                  key={d.toISOString()}
                  onClick={() => handleSelectDate(d)}
                  className={`
                    h-10 w-10
                    flex items-center justify-center
                    rounded
                    hover:bg-blue-100
                    ${isSelected ? "bg-blue-400 text-white" : ""}
                    ${isToday && !isSelected ? "border border-blue-400" : ""}
                  `}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右: 選択週(月~金) 時間割 */}
        <div>
          <div className="overflow-x-auto">
            <table className="table-fixed bg-[#F7F7F7] text-sm">
              <thead>
                <tr>
                  <th
                    className="border-b border-r border-white border-8 p-2"
                    style={{ width: 120 }}
                  >
                    時限
                  </th>
                  {weekDates.map((wd, idx) => (
                    <th
                      key={idx}
                      className="border-b border-r border-white border-8 p-2 text-center"
                      style={{ width: 120 }}
                    >
                      {format(wd, "M/d")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period}>
                    {/* 左列: 時限 */}
                    <td
                      className="border-r border-b border-white border-8 p-2 text-center align-middle"
                      style={{ width: 120 }}
                    >
                      {p.label.split("\n").map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </td>

                    {weekDates.map((wd, colIdx) => {
                      const dateKey = format(wd, "yyyy/MM/dd");
                      const arr = scheduleMap[dateKey] || [null, null, null, null, null, null];
                      const info = arr[p.period - 1];
                      if (!info) {
                        // 予定なし
                        return (
                          <td
                            key={colIdx}
                            className="border-r border-b border-white border-8 text-center align-middle h-20 text-gray-400"
                            style={{ width: 120 }}
                          >
                            
                          </td>
                        );
                      }
                      // 授業あり => ボタン
                      return (
                        <td
                          key={colIdx}
                          className="border-r border-b border-white border-8 text-center align-middle h-20 bg-[#D7ECFF]"
                          style={{ width: 120 }}
                        >
                          <button
                            onClick={() => handleClickSchedule(wd, p.period, info)}
                            className="w-full h-full inline-block bg-blue-100 text-blue-700 px-3 py-5 rounded hover:bg-blue-200"
                          >
                            {info.lessonName}
                            <br />
                            {info.classId !== null ? `class_id=${info.classId}` : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
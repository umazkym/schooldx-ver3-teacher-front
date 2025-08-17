"use client"
import React, { useState, useEffect, useMemo } from "react"
import { addMonths, subMonths, format, getDay } from "date-fns"
import { useRouter } from "next/navigation"

/**
 * 授業登録ページ
 * - 右側の時間割にダミー配置
 * - ユーザーが時間割をクリックすると { date, day_of_week, period, time } を
 *   /lesson_registrations/calendar へPOST → timetable_idを取得 → settingページへ移動
 */
export default function ClassRegistrationPage() {
  const router = useRouter()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  // 「今日」
  const today = new Date()

  // カレンダー表示の年月
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()) // 0-based

  // 時間割用：選択日(初期 = 今日)
  const [selectedDate, setSelectedDate] = useState<Date>(today)

  // 前の月に移動
  const handlePrevMonth = () => {
    const base = new Date(currentYear, currentMonth, 1)
    const prev = subMonths(base, 1)
    setCurrentYear(prev.getFullYear())
    setCurrentMonth(prev.getMonth())
  }

  // 次の月に移動
  const handleNextMonth = () => {
    const base = new Date(currentYear, currentMonth, 1)
    const next = addMonths(base, 1)
    setCurrentYear(next.getFullYear())
    setCurrentMonth(next.getMonth())
  }

  // 指定年月の1日～末日をDate配列に
  function getDaysInMonth(year: number, month: number): Date[] {
    const first = new Date(year, month, 1)
    const result: Date[] = []
    while (first.getMonth() === month) {
      result.push(new Date(first))
      first.setDate(first.getDate() + 1)
    }
    return result
  }
  const daysInThisMonth = getDaysInMonth(currentYear, currentMonth)

  // 日付クリックで selectedDate 更新
  const handleSelectDate = (d: Date) => {
    setSelectedDate(d)
  }

  /** selectedDate を含む週(月曜～金曜) */
  function getWeekDates(date: Date) {
    // 週開始を月曜に
    const wd = getDay(date) // 0=日,1=月,...6=土
    const mondayOffset = wd === 0 ? 6 : wd - 1
    const monday = new Date(date)
    monday.setDate(date.getDate() - mondayOffset)

    const days: Date[] = []
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }
    return days
  }
  const weekDates = getWeekDates(selectedDate)

  // 時限データ(2行表示 + time情報)
  const periods = [
    { period: 1, label: "1限\n8:35~9:30", time: "8:35-9:30" },
    { period: 2, label: "2限\n9:40~10:35", time: "9:40-10:35" },
    { period: 3, label: "3限\n10:45~11:40", time: "10:45-11:40" },
    { period: 4, label: "4限\n12:25~13:20", time: "12:25-13:20" },
    { period: 5, label: "5限\n13:30~14:25", time: "13:30-14:25" },
    { period: 6, label: "6限\n14:35~15:30", time: "14:35-15:30" },
  ]

  /**
   * ダミーデータ(2/15～3/31)
   */
  // const SCHEDULE_DATA = [
    // { date: "2025/02/15", period: 1, subject: "物理基礎", grade: "1年", className: "A組" },
    // { date: "2025/02/15", period: 3, subject: "物理", grade: "2年", className: "C組" },
    // { date: "2025/02/16", period: 2, subject: "物理(演習)", grade: "3年", className: "Z組" },
    // { date: "2025/02/17", period: 4, subject: "物理基礎", grade: "2年", className: "D組" },
    // { date: "2025/02/17", period: 5, subject: "物理(補講)", grade: "3年", className: "E組" },
    // { date: "2025/02/20", period: 1, subject: "物理", grade: "2年", className: "F組" },
    // { date: "2025/02/22", period: 6, subject: "物理基礎", grade: "1年", className: "A組" },
    // { date: "2025/02/26", period: 2, subject: "物理", grade: "3年", className: "C組" },
    // { date: "2025/02/28", period: 3, subject: "物理基礎", grade: "2年", className: "G組" },
    // { date: "2025/03/01", period: 5, subject: "物理(補講)", grade: "3年", className: "H組" },
    // { date: "2025/03/04", period: 1, subject: "物理基礎", grade: "1年", className: "B組" },
    // { date: "2025/03/08", period: 4, subject: "物理", grade: "2年", className: "Y組" },
    // { date: "2025/03/12", period: 2, subject: "物理基礎", grade: "1年", className: "C組" },
    // { date: "2025/03/14", period: 6, subject: "物理(演習)", grade: "2年", className: "A組" },
    // { date: "2025/03/18", period: 3, subject: "物理", grade: "3年", className: "C組" },
    // { date: "2025/03/22", period: 2, subject: "物理基礎", grade: "2年", className: "B組" },
    // { date: "2025/03/24", period: 5, subject: "物理", grade: "3年", className: "Z組" },
    // { date: "2025/03/26", period: 6, subject: "物理(補講)", grade: "1年", className: "K組" },
    // { date: "2025/03/28", period: 1, subject: "物理基礎", grade: "1年", className: "A組" },
  //   { date: "2025/03/12", period: 6, subject: "物理", grade: "1年", className: "A組" },
  // ]

  /**
   * ────────────────
   * ①  カレンダーAPI取得
   * ────────────────
   */
  interface LessonCalendarEntry {
    timetable_id: number
    date: string        // "2025-03-12"
    day_of_week: string // "水"
    period: number
    time: string        // "14:35-15:30"
    lesson_id: number | null
    class_id: number
    lesson_name: string | null
    delivery_status: boolean
    lesson_status: boolean
  }

  const [scheduleEntries, setScheduleEntries] = useState<LessonCalendarEntry[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/lesson_attendance/calendar`,
          { method: "GET" }
        )
        if (!res.ok) throw new Error(`GET calendar failed: ${res.status}`)
        setScheduleEntries(await res.json())
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  /**
   * ────────────────
   * ②  日付×時限マップ生成
   * ────────────────
   */
  const scheduleMap = useMemo(() => {
    const map: Record<
      string,
      Array<{ lessonName: string; classId: number | null } | null>
    > = {}
    scheduleEntries.forEach((e) => {
      const key = e.date.replace(/-/g, "/")      // "yyyy/MM/dd"
      if (!map[key]) map[key] = [null, null, null, null, null, null]
      map[key][e.period - 1] = {
        // lessonName: e.lesson_name ?? "物理",
        lessonName:"物理",
        classId: e.class_id ?? null,
      }
    })
    return map
  }, [scheduleEntries])

  // 曜日取得
  function toJapaneseDayOfWeek(d: Date) {
    const dayNum = d.getDay()
    const JpDays = ["日", "月", "火", "水", "木", "金", "土"]
    return JpDays[dayNum]
  }

  const handleClickSchedule = async (
    dateObj: Date,
    periodInfo: { period: number; time: string }
  ) => {
    const dateStr = format(dateObj, "yyyy-MM-dd") // 例: 2025-03-04
    const day_of_week = toJapaneseDayOfWeek(dateObj) // "火"など
    const payload = {
      date: dateStr,
      day_of_week,
      period: periodInfo.period,
      time: periodInfo.time,
    }
    try {
      const res = await fetch(
        `${apiBaseUrl}/lesson_registrations/calendar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`Calendar POST failed: ${res.status}, ${msg}`)
      }
      const data = await res.json()
      const timetableId = data.timetable_id
      // ページ遷移
      router.push(`/class-registration/setting?tid=${timetableId}`)
    } catch (error) {
      console.error(error)
      alert(`POST失敗: ${String(error)}`)
    }
  }

  return (
    <div>
      {/* タイトル行 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => history.back()} className="font-bold hover:underline mr-4">
            &lt; 戻る
          </button>
        </div>
        <div
          className="border border-blue-100 bg-blue-50 py-2 px-4 rounded text-gray-700 text-center"
          style={{ minWidth: "700px" }}
        >
          登録する授業のコマを選択してください
        </div>
      </div>

      <div className="flex gap-8">
        {/* 左側: 月カレンダー */}
        <div>
          {/* 年月切り替え */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={handlePrevMonth}
              className="text-[#5E5E5E] font-bold hover:underline"
            >
              &lt; 前の月
            </button>
            <div className="font-semibold text-[#5E5E5E]">
              {currentYear}年 {currentMonth + 1}月
            </div>
            <button
              onClick={handleNextMonth}
              className="text-[#5E5E5E] font-bold hover:underline"
            >
              次の月 &gt;
            </button>
          </div>

          {/* カレンダー (7列) */}
          <div className="grid grid-cols-7 gap-2 p-2 border border-gray-300 rounded">
            {daysInThisMonth.map((d) => {
              const dayNum = d.getDate()
              // "今日" 判定
              const isToday =
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                dayNum === today.getDate()
              // "選択中" 判定
              const isSelected =
                d.getFullYear() === selectedDate.getFullYear() &&
                d.getMonth() === selectedDate.getMonth() &&
                dayNum === selectedDate.getDate()
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
              )
            })}
          </div>
        </div>

        {/* 右側: 選択週(月～金) */}
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
                    {/* 左列(時限) */}
                    <td
                      className="border-r border-b border-white border-8 p-2 text-center align-middle"
                      style={{ width: 120 }}
                    >
                      {p.label.split("\n").map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </td>

                    {weekDates.map((wd, colIdx) => {
                      const dateKey = format(wd, "yyyy/MM/dd")
                      const arr = scheduleMap[dateKey] || [null, null, null, null, null, null]
                      const info = arr[p.period - 1]

                      if (!info) {
                        return (
                          <td
                            key={colIdx}
                            className="border-r border-b border-white border-8 text-center align-middle h-20 hover:bg-blue-50 cursor-pointer"
                            style={{ width: 120 }}
                            onClick={() => handleClickSchedule(wd, p)}
                          >
                            <span className="text-gray-400"></span>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={colIdx}
                          className="border-r border-b border-white border-8 text-center align-middle h-20 bg-[#D7ECFF]"
                          style={{ width: 120 }}
                        >
                          <button
                            onClick={() => handleClickSchedule(wd, p)}
                            className="w-full h-full inline-block bg-blue-100 text-blue-700 px-3 py-5 rounded hover:bg-blue-200"
                          >
                            {info.lessonName}
                            <br />
                            {info.classId !== null ? `class_id=${info.classId}` : ""}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

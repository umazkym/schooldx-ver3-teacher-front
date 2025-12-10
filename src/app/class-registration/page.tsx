"use client"
import React, { useState, useEffect, useMemo } from "react"
import { addMonths, subMonths, format, getDay } from "date-fns"
import { useRouter } from "next/navigation"
import { apiBaseUrl } from '@/lib/apiConfig';

// クラスごとの色定義
const classColors = [
  { td: 'bg-blue-50', button: 'bg-blue-100', text: 'text-blue-800', hover: 'hover:bg-blue-200' },
  { td: 'bg-green-50', button: 'bg-green-100', text: 'text-green-800', hover: 'hover:bg-green-200' },
  { td: 'bg-yellow-50', button: 'bg-yellow-100', text: 'text-yellow-800', hover: 'hover:bg-yellow-200' },
  { td: 'bg-purple-50', button: 'bg-purple-100', text: 'text-purple-800', hover: 'hover:bg-purple-200' },
  { td: 'bg-pink-50', button: 'bg-pink-100', text: 'text-pink-800', hover: 'hover:bg-pink-200' },
  { td: 'bg-indigo-50', button: 'bg-indigo-100', text: 'text-indigo-800', hover: 'hover:bg-indigo-200' },
];

const getClassColors = (classId: number | null) => {
  if (classId === null) {
    return { td: 'bg-white', button: 'hover:bg-gray-100', text: 'text-gray-400', hover: '' };
  }
  return classColors[classId % classColors.length];
};

/**
 * 授業登録ページ
 */
export default function ClassRegistrationPage() {
  const router = useRouter()

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [scheduleEntries, setScheduleEntries] = useState<LessonCalendarEntry[]>([]);
  const today = useMemo(() => new Date(), []);

  interface LessonCalendarEntry {
    timetable_id: number
    date: string
    day_of_week: string
    period: number
    time: string
    lesson_id: number | null
    class_id: number
    class_name: string | null;
    lesson_name: string | null
    delivery_status: boolean
    lesson_status: number  // 1=READY, 2=ACTIVE, 3=END
  }

  useEffect(() => {
    if (!apiBaseUrl) {
      console.error("APIのベースURLが設定されていません。");
      return;
    }
    ; (async () => {
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
  }, []);

  const scheduleMap = useMemo(() => {
    const map: Record<
      string,
      Array<{ lessonName: string; classId: number | null; className: string | null; } | null>
    > = {}
    scheduleEntries.forEach((e) => {
      const key = e.date.replace(/-/g, "/")
      if (!map[key]) map[key] = [null, null, null, null, null, null]
      map[key][e.period - 1] = {
        lessonName: e.lesson_name ?? "物理",
        classId: e.class_id ?? null,
        className: e.class_name ?? null,
      }
    })
    return map
  }, [scheduleEntries])

  if (!apiBaseUrl) {
    return <div>エラー: APIのベースURLが設定されていません。</div>;
  }

  const handlePrevMonth = () => {
    const base = new Date(currentYear, currentMonth, 1)
    const prev = subMonths(base, 1)
    setCurrentYear(prev.getFullYear())
    setCurrentMonth(prev.getMonth())
  }

  const handleNextMonth = () => {
    const base = new Date(currentYear, currentMonth, 1)
    const next = addMonths(base, 1)
    setCurrentYear(next.getFullYear())
    setCurrentMonth(next.getMonth())
  }

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

  const handleSelectDate = (d: Date) => {
    setSelectedDate(d)
  }

  function getWeekDates(date: Date) {
    const wd = getDay(date)
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

  const periods = [
    { period: 1, label: "1限\n8:35~9:30", time: "8:35-9:30" },
    { period: 2, label: "2限\n9:40~10:35", time: "9:40-10:35" },
    { period: 3, label: "3限\n10:45~11:40", time: "10:45-11:40" },
    { period: 4, label: "4限\n12:25~13:20", time: "12:25-13:20" },
    { period: 5, label: "5限\n13:30~14:25", time: "13:30-14:25" },
    { period: 6, label: "6限\n14:35~15:30", time: "14:35-15:30" },
  ]

  function toJapaneseDayOfWeek(d: Date) {
    const dayNum = d.getDay()
    const JpDays = ["日", "月", "火", "水", "木", "金", "土"]
    return JpDays[dayNum]
  }

  const handleClickSchedule = async (
    dateObj: Date,
    periodInfo: { period: number; time: string }
  ) => {
    const dateStr = format(dateObj, "yyyy-MM-dd")
    const day_of_week = toJapaneseDayOfWeek(dateObj)
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
      router.push(`/class-registration/setting?tid=${timetableId}`)
    } catch (error) {
      console.error(error)
      alert(`POST失敗: ${String(error)}`)
    }
  }

  return (
    <div>
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
        <div>
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

          <div className="grid grid-cols-7 gap-2 p-2 border border-gray-300 rounded">
            {daysInThisMonth.map((d) => {
              const dayNum = d.getDate()
              const isToday =
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                dayNum === today.getDate()
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
                            className="border-r border-b border-white border-8 text-center align-middle h-20 hover:bg-gray-100 cursor-pointer"
                            style={{ width: 120 }}
                            onClick={() => handleClickSchedule(wd, p)}
                          >
                            <span className="text-gray-400"></span>
                          </td>
                        )
                      }

                      const colors = getClassColors(info.classId);
                      return (
                        <td
                          key={colIdx}
                          className={`border-r border-b border-white border-8 text-center align-middle h-20 ${colors.td}`}
                          style={{ width: 120 }}
                        >
                          <button
                            onClick={() => handleClickSchedule(wd, p)}
                            className={`w-full h-full inline-block px-3 py-5 rounded font-semibold ${colors.button} ${colors.text} ${colors.hover}`}
                          >
                            {info.lessonName}
                            <br />
                            {info.className}
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
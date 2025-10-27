"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { apiBaseUrl } from '@/lib/apiConfig';

/**
 * 型定義
 */
interface AnswerDataWithDetails {
  student_id: number;
  lesson_id: number;
  answer_correctness: number | null;
  answer_status: number | null; // 0:未回答, 1:解答中, 2:解答済
  answer_start_unix: number | null;
  answer_end_unix: number | null;
  question: {
    question_id: number; // ネストされたオブジェクト内に定義
    question_label: string;
  };
}

// 画面表示用の型
interface Student {
  id: number; // student_idと一致させる
  students_number: number; // students_tableの出席番号
  name: string;
  // 4問分の解答状況
  q1: string;
  q1Progress: number;
  q2: string;
  q2Progress: number;
  q3: string;
  q3Progress: number;
  q4: string;
  q4Progress: number;
}

type StudentStringKey = { [K in keyof Student]: Student[K] extends string ? K : never }[keyof Student];
type StudentNumberKey = { [K in keyof Student]: Student[K] extends number ? K : never }[keyof Student];


interface LessonThemeBlock {
  lesson_theme_id: number;
  lesson_theme_name: string;
  material_name: string;
  part_name: string | null;
  chapter_name: string | null;
  unit_name: string | null;
}

interface LessonInformation {
  date: string;
  day_of_week: string;
  period: number;
  lesson_name: string | null;
  lesson_theme: Record<string, LessonThemeBlock>;
}

const questionIdToKeyMap: { [id: number]: { status: StudentStringKey, progress: StudentNumberKey } } = {
  15: { status: 'q1', progress: 'q1Progress' },
  17: { status: 'q2', progress: 'q2Progress' },
  20: { status: 'q3', progress: 'q3Progress' },
  23: { status: 'q4', progress: 'q4Progress' },
};

/**
 * ダッシュボード主要コンポーネント
 */
function DashboardPageContent() {
  const router = useRouter();

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    socket.on("connect", () =>
      console.log("🌐 Web connected (Dashboard)")
    );
    socket.on("from_flutter", (data) =>
      console.log("🌐 Web recv from Flutter:", data)
    );

    return () => {
        if (socketRef.current) {
            socketRef.current.off("connect");
            socketRef.current.off("from_flutter");
        }
    };
  }, []);

  const searchParams = useSearchParams();
  const lessonIdStr = searchParams.get("lesson_id");
  const lessonId = lessonIdStr ? parseInt(lessonIdStr, 10) : null;

  const [lessonInfo, setLessonInfo] = useState<LessonInformation | null>(null);
  const [lessonMeta] = useState<{
    date: string;
    day_of_week: string;
    period: number;
    lesson_name: string | null;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = sessionStorage.getItem("selectedLessonMeta");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const [selectedContent, setSelectedContent] = useState<LessonThemeBlock | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("selectedContentInfo");
      if (s) setSelectedContent(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => {
    if (!lessonId || !apiBaseUrl) return;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/lesson_attendance/lesson_information?lesson_id=${lessonId}`
        );
        if (!res.ok) return;
        const d = (await res.json()) as LessonInformation;
        setLessonInfo(d);
      } catch {}
    })();
  }, [lessonId, apiBaseUrl]);

  // 生徒データを API から取得
  useEffect(() => {
    if (!lessonId || !apiBaseUrl) return;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/grades/raw_data?lesson_id=${lessonId}`
        );
        if (!res.ok) return;
        const data = await res.json();

        // 生徒情報を一意に抽出
        const studentMap = new Map<number, Student>();
        data.forEach((item: any) => {
          if (!studentMap.has(item.student.student_id)) {
            studentMap.set(item.student.student_id, {
              id: item.student.student_id,
              students_number: item.student.students_number,
              name: item.student.name,
              q1: '',
              q1Progress: 0,
              q2: '',
              q2Progress: 0,
              q3: '',
              q3Progress: 0,
              q4: '',
              q4Progress: 0,
            });
          }
        });

        setStudents(Array.from(studentMap.values()));
      } catch (err) {
        console.error('Failed to fetch student data:', err);
      }
    })();
  }, [lessonId, apiBaseUrl]);

  const srcDate = lessonInfo ?? lessonMeta;
  const dateInfoQuery = srcDate
    ? `${srcDate.date} (${srcDate.day_of_week}) / ${srcDate.period}限目 ${srcDate.lesson_name ?? ""}`
    : "ロード中...";

  const firstTheme = lessonInfo ? Object.values(lessonInfo.lesson_theme)[0] : undefined;
  const src = selectedContent ?? firstTheme;
  const contentInfoQuery = src
    ? `${src.lesson_theme_name} / ${src.material_name} ${src.part_name ?? ""} ${src.chapter_name ?? ""} ${src.unit_name ?? ""}`.trim()
    : "";
  const timerQuery = searchParams.get("timer") || "5";

  const defaultMinutes = parseInt(timerQuery, 10) || 5;
  const [secondsLeft, setSecondsLeft] = useState(defaultMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);

  const [isLessonStarted] = useState(true);

  let message = "演習開始のボタンを押してください";
  if (isRunning) {
    message = "時間になったら演習終了を押してください";
  } else if (!isRunning && secondsLeft > 0 && secondsLeft < defaultMinutes * 60) {
    message = "一時停止中...";
  }

  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft <= 0) {
      setIsRunning(false);
      return;
    }
    const t = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [isRunning, secondsLeft]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const timeStr = `${mm}:${ss}`;

  const handleChangeTimer = () => {
    const newValStr = prompt("タイマーを何分にしますか？", timerQuery);
    if (newValStr) {
      const newVal = parseInt(newValStr, 10);
      if (!isNaN(newVal) && newVal > 0) {
        setSecondsLeft(newVal * 60);
      }
    }
  };

  const startTimer = async () => {
    if (!isLessonStarted) {
      alert("授業が開始されていません。前の画面に戻って授業を開始してください。");
      return;
    }

    const themeId = selectedContent?.lesson_theme_id ?? firstTheme?.lesson_theme_id;

    if (!themeId) {
      alert("演習のテーマIDが見つかりません。");
      return;
    }

    if (!apiBaseUrl) {
      alert("APIのベースURLが設定されていません。");
      return;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/lesson_themes/${themeId}/start_exercise`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(errorData.message || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      console.log('API Response:', data.message);

      setIsRunning(true);
      const msg = `exercise_start,${themeId}`;
      socketRef.current?.emit("to_flutter", msg);
      console.log("🌐 Web send to server →", msg);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`演習開始に失敗しました: ${errorMessage}`);
      console.error(err);
    }
  };

  // ▼▼▼▼▼ ここから変更 ▼▼▼▼▼
  const stopTimer = async () => {
    const themeId = selectedContent?.lesson_theme_id ?? firstTheme?.lesson_theme_id;

    if (!themeId) {
      alert("演習のテーマIDが見つかりません。");
      setIsRunning(false);
      return;
    }

    if (!apiBaseUrl) {
      alert("APIのベースURLが設定されていません。");
      setIsRunning(false);
      return;
    }

    try {
      // 要件⑤: バックエンドAPIを呼び出す
      const res = await fetch(`${apiBaseUrl}/api/lesson_themes/${themeId}/end_exercise`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(errorData.message || `HTTP error ${res.status}`);
      }
      
      const data = await res.json();
      console.log('API Response:', data.message);

      // API成功後にタイマーを停止し、新しい形式でWebSocketメッセージを送信
      setIsRunning(false);
      const message = `exercise_end,${themeId}`; // 新しいメッセージ形式
      socketRef.current?.emit("to_flutter", message);
      console.log("🌐 Web send to server →", message);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`演習終了に失敗しました: ${errorMessage}`);
      console.error(err);
      // API失敗時もUIのタイマーは停止する
      setIsRunning(false);
    }
  };
  // ▲▲▲▲▲ ここまで変更 ▲▲▲▲▲

  const [students, setStudents] = useState<Student[]>([]);

  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  const calcIcon = useCallback((d?: AnswerDataWithDetails) => {
    if (!d || d.answer_status === 0) return "";
    if (d.answer_status === 1) return "pencil";
    if (d.answer_status === 2) {
      if (d.answer_correctness === 0) return "wrong";
      if (d.answer_correctness === 1) return "correct";
    }
    return "";
  }, []);

  const calcProgress = useCallback((d?: AnswerDataWithDetails) => {
    if (!d || d.answer_start_unix == null || d.answer_start_unix === 0) return 0;
    const startUnix = d.answer_start_unix;

    if (d.answer_end_unix != null && d.answer_end_unix > 0) {
      const diff = d.answer_end_unix - startUnix;
      return Math.min(100, (diff / (defaultMinutes * 60)) * 100);
    }
    
    if (d.answer_status === 1) {
      const nowUnix = Math.floor(Date.now() / 1000);
      const diff = nowUnix - startUnix;
      return Math.min(100, (diff / (defaultMinutes * 60)) * 100);
    }
    
    return 0;
  }, [defaultMinutes]);

  const fetchAllStudentsData = useCallback(async () => {
    if (!lessonId || !apiBaseUrl) return;
    const currentStudents = studentsRef.current;
    const studentIds = currentStudents.map(s => s.id);

    const allStudentsData = await Promise.all(
      studentIds.map(async (studentId) => {
        try {
          const url = `${apiBaseUrl}/api/answers/?student_id=${studentId}&lesson_id=${lessonId}`;
          const res = await fetch(url);
          if (!res.ok) {
            if (res.status === 404) return { studentId, data: [] };
            console.error(`Error fetching data for student ${studentId}: ${res.status}`);
            return { studentId, error: `Status ${res.status}` };
          }
          const data: AnswerDataWithDetails[] = await res.json();
          return { studentId, data };
        } catch (error) {
          console.error(`Error fetching data for student ${studentId}:`, error);
          return { studentId, error: String(error) };
        }
      })
    );

    setStudents(prevStudents =>
      prevStudents.map(student => {
        const result = allStudentsData.find(d => d.studentId === student.id);
        if (!result || result.error || !result.data) {
          return student;
        }

        const studentUpdate: Partial<Student> = {};

        result.data.forEach(answer => {
          const keys = questionIdToKeyMap[answer.question.question_id];
            if (keys) {
              const statusKey = keys.status;
              const progressKey = keys.progress;
              
              const newProgress = calcProgress(answer);
              const currentProgress = student[progressKey];

              if (answer.answer_status !== 1 || newProgress >= currentProgress) {
                studentUpdate[progressKey] = newProgress;
              }
              studentUpdate[statusKey] = calcIcon(answer);
          }
        });
        return { ...student, ...studentUpdate };
      })
    );
  }, [lessonId, apiBaseUrl, calcIcon, calcProgress]);

  useEffect(() => {
    if (!lessonId || !isRunning) return;

    fetchAllStudentsData(); 
    const intervalId = setInterval(fetchAllStudentsData, 5000);

    return () => clearInterval(intervalId);
  }, [lessonId, isRunning, fetchAllStudentsData]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setStudents(prevStudents => 
        prevStudents.map(student => {
          const studentUpdate: Partial<Student> = {};
          
          Object.values(questionIdToKeyMap).forEach(keyInfo => {
            const statusKey = keyInfo.status;
            const progressKey = keyInfo.progress;

            if (student[statusKey] === 'pencil') {
              const currentProgress = student[progressKey];
              const increment = 100 / (defaultMinutes * 60);
              const newProgress = Math.min(100, currentProgress + increment);
              
              if (currentProgress !== newProgress) {
                studentUpdate[progressKey] = newProgress;
              }
            }
          });
          
          if (Object.keys(studentUpdate).length > 0) {
              return { ...student, ...studentUpdate };
          }
          return student;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, defaultMinutes]);

  function CellWithBar({ icon, progress }: { icon: string; progress: number }) {
    const pct = Math.max(0, Math.min(100, progress));
    return (
      <div className="flex items-center gap-1 px-1">
        <div
          className="h-3 flex-1 rounded-full bg-[#F0F0F0] relative overflow-hidden"
          style={{ minWidth: 30 }}
        >
          <div
            className="absolute left-0 top-0 h-full bg-[#1CADFE]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="flex-none">{renderIcon(icon)}</span>
      </div>
    );
  }

  function renderIcon(st: string) {
    switch (st) {
      case "done":
        return <span className="text-green-600 font-bold">✓</span>;
      case "correct":
        return <span className="text-green-600 font-bold">○</span>;
      case "wrong":
        return <span className="text-red-500 font-bold">×</span>;
      case "pencil":
        return <span className="text-[#555454]">✎</span>;
      case "checked":
        return <span className="font-bold text-[#555454]">✓</span>;
      default:
        return null;
    }
  }

  function calcQAPercentage(
    arr: Student[],
    key: "q1" | "q2" | "q3" | "q4"
  ): number {
    let correctCount = 0;
    let wrongCount = 0;
    for (const st of arr) {
      if (st[key] === "correct") correctCount++;
      if (st[key] === "wrong") wrongCount++;
    }
    const sum = correctCount + wrongCount;
    if (sum === 0) return 0;
    return (correctCount / sum) * 100;
  }

  function bgColorQA(status: string) {
    if (status === "correct") {
      return "p-2 border border-[#979191] bg-[#C6EFD0]";
    }
    if (status === "wrong") {
      return "p-2 border border-[#979191] bg-[#FFD0D0]";
    }
    return "p-2 border border-[#979191] bg-white";
  }

  function ProgressBarBar({
    color,
    bg,
    percentage,
  }: {
    color: "green";
    bg: "gray" | "red";
    percentage: number;
  }) {
    const clamped = Math.max(0, Math.min(100, percentage));
    return (
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mx-2">
        {bg === "gray" && (
          <div className="absolute top-0 left-0 w-full h-full bg-[#DBDBDB]" />
        )}
        {bg === "red" && (
          <div className="absolute top-0 left-0 w-full h-full bg-[#E76568]" />
        )}
        {color === "green" && (
          <div
            className="absolute top-0 left-0 h-full bg-[#4CB64B]"
            style={{ width: `${clamped}%` }}
          />
        )}
        <div className="absolute w-full h-full flex items-center justify-center text-xs text-white font-bold">
          {Math.round(clamped)}%
        </div>
      </div>
     );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="font-bold hover:underline mr-4"
          >
            &lt; 戻る
          </button>
          <span className="text-xl font-bold">ダッシュボード</span>
        </div>
        <div className="border border-blue-100 bg-blue-50 p-2 rounded mb-4 min-w-[700px] text-center">
          {message}
        </div>
      </div>

      <div className="text-gray-600 mb-2 flex justify-between">
        <div>
          <div>{dateInfoQuery}</div>
          <div>{contentInfoQuery}</div>
        </div>
        <div
          className="m-4 w-24 h-24 border-4 border-blue-600 rounded-full flex items-center justify-center text-blue-600 text-lg font-bold cursor-pointer hover:opacity-80"
          title="クリックして時間を変更"
          onClick={handleChangeTimer}
        >
           {timeStr}
        </div>
      </div>

      <div className="flex items-center mb-2 gap-2 justify-end">
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          onClick={startTimer}
          disabled={!isLessonStarted || isRunning}
        >
          演習開始
        </button>
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
           onClick={stopTimer}
           disabled={!isRunning}
        >
          演習終了
        </button>
        <button className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600">
          授業コンテンツ切り替え
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="border border-[#979191] text-sm min-w-max w-full">
          <thead className="bg-white">
            <tr>
              <th className="p-2 border border-[#979191]">出席番号</th>
              <th className="p-2 border border-[#979191]">名前</th>
              <th className="p-2 border border-[#979191]">問題1</th>
              <th className="p-2 border border-[#979191]">問題2</th>
              <th className="p-2 border border-[#979191]">問題3</th>
              <th className="p-2 border border-[#979191]">問題4</th>
            </tr>
            <tr className="bg-white text-xs">
              <td className="p-1 border border-[#979191] text-center"></td>
              <td className="p-1 border border-[#979191] text-center"></td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                  color="green"
                  bg="red"
                  percentage={calcQAPercentage(students, "q1")}
                />
              </td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                   color="green"
                  bg="red"
                  percentage={calcQAPercentage(students, "q2")}
                />
              </td>
              <td className="p-1 border border-[#979191]">
                 <ProgressBarBar
                  color="green"
                  bg="red"
                  percentage={calcQAPercentage(students, "q3")}
                />
              </td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                  color="green"
                  bg="red"
                  percentage={calcQAPercentage(students, "q4")}
                />
              </td>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => (
              <tr key={st.id} className="text-center">
                <td className="p-2 border border-[#979191]">{st.students_number}</td>
                <td className="p-2 border border-[#979191]">{st.name}</td>
                <td className={bgColorQA(st.q1)}>
                  <CellWithBar icon={st.q1} progress={st.q1Progress} />
                </td>
                <td className={bgColorQA(st.q2)}>
                  <CellWithBar icon={st.q2} progress={st.q2Progress} />
                </td>
                <td className={bgColorQA(st.q3)}>
                  <CellWithBar
                    icon={st.q3}
                    progress={st.q3Progress}
                  />
                </td>
                <td className={bgColorQA(st.q4)}>
                  <CellWithBar
                    icon={st.q4}
                    progress={st.q4Progress}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
       </div>
    </div>
  );
}

/**
 * デフォルトエクスポート: Suspense で DashboardPageContent をラップ
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}
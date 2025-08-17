"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSearchParams, useRouter } from "next/navigation";

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
  no: number;
  name: string;
  lectureProgress: number;
  lectureView: string;
  confirm1Progress: number;
  confirm1: string;
  confirm2Progress: number;
  confirm2: string;
  question: boolean;
  attend: boolean;
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

// [修正点] Studentインターフェースのキーを、その値の型に応じてより具体的に定義
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

// この画面で扱う固定の問題IDとUIのキーをマッピング
// [修正点] 型定義をより厳密なものに変更
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
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  /** Socket.IO 接続 **/
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(
        `${apiBaseUrl}`,
        {
          transports: ["websocket"],
          withCredentials: true,
        },
      );

      socketRef.current.on("connect", () =>
        console.log("🌐 Web connected (Dashboard)")
      );
      socketRef.current.on("from_flutter", (data) =>
        console.log("🌐 Web recv from Flutter:", data)
      );
    }

    return () => {
        if(socketRef.current && socketRef.current.connected) {
            socketRef.current.disconnect();
            socketRef.current = null;
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
    if (!lessonId) return;
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
  }, [lessonId]);

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
  const [startingLesson, setStartingLesson] = useState(false);
  const [isLessonStarted, setIsLessonStarted] = useState(false);

  let message = "授業開始ボタンを押して、授業を開始してください";
    if (isLessonStarted && !isRunning) {
    message = "演習開始のボタンを押してください";
  }
  if (isRunning) {
    message = "時間になったら演習終了を押してください";
  } else if (isLessonStarted && !isRunning && secondsLeft > 0 && secondsLeft < defaultMinutes * 60) {
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

  const lessonStart = async () => {
    if (!lessonId) {
      alert("lesson_id が取得できません。");
      return;
    }
    const themeId = selectedContent?.lesson_theme_id ?? firstTheme?.lesson_theme_id;
    if (themeId == null) {
      alert("lesson_theme_id が取得できません。");
      return;
    }

    setStartingLesson(true);
    try {
      const url = `${apiBaseUrl}/api/answer-data-bulk/lessons/${lessonId}/themes/${themeId}/generate-answer-data`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`回答データ生成に失敗しました: ${res.status}\n${msg}`);
      }
      const data = await res.json();
      socketRef.current?.emit("to_flutter", "lesson_start");
      console.log("🌐 Web send to server → lesson_start");
      alert(data.message ?? "授業を開始しました。");

      setIsLessonStarted(true);

    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setStartingLesson(false);
    }
  };

  const startTimer = () => {
    if (!isLessonStarted) {
        alert("先に授業開始ボタンを押してください。");
        return;
    }
    setIsRunning(true);
    const themeId = selectedContent?.lesson_theme_id ?? firstTheme?.lesson_theme_id;
    if (themeId != null) {
      const msg = `lesson_theme_id,${themeId}`;
      socketRef.current?.emit("to_flutter", msg);
      console.log("🌐 Web send to server →", msg);
    } else {
      socketRef.current?.emit("to_flutter", "exercise_start");
      console.warn("lesson_theme_id が取得できなかったため fallback しました");
    }
  };

  const stopTimer = () => {
    setIsRunning(false);
    socketRef.current?.emit("to_flutter", "exercise_end");
    console.log("🌐 Web send to server → exercise_end");
  };

  const [students, setStudents] = useState<Student[]>([
    { no: 1, id: 1, name: "生徒A", lectureProgress: 35, lectureView: 'done', confirm1Progress: 60, confirm1: 'done', confirm2Progress: 10, confirm2: 'done', question: true, attend: true, q1: '', q1Progress: 0, q2: '', q2Progress: 0, q3: '', q3Progress: 0, q4: '', q4Progress: 0 },
    { no: 2, id: 2, name: "生徒B", lectureProgress: 10, lectureView: 'done', confirm1Progress: 90, confirm1: 'done', confirm2Progress: 40, confirm2: 'done', question: true, attend: true, q1: '', q1Progress: 0, q2: '', q2Progress: 0, q3: '', q3Progress: 0, q4: '', q4Progress: 0 },
    { no: 3, id: 3, name: "生徒C", lectureProgress: 80, lectureView: 'done', confirm1Progress: 5, confirm1: 'done', confirm2Progress: 75, confirm2: 'done', question: false, attend: true, q1: '', q1Progress: 0, q2: '', q2Progress: 0, q3: '', q3Progress: 0, q4: '', q4Progress: 0 },
    { no: 4, id: 4, name: "生徒D", lectureProgress: 45, lectureView: 'done', confirm1Progress: 10, confirm1: 'done', confirm2Progress: 30, confirm2: 'done', question: true, attend: true, q1: '', q1Progress: 0, q2: '', q2Progress: 0, q3: '', q3Progress: 0, q4: '', q4Progress: 0 },
  ]);

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
    if (!lessonId) return;
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
              // [修正点] 型が正しく推論されるため `as number` が不要に
              const currentProgress = student[progressKey];

              if (answer.answer_status !== 1 || newProgress >= currentProgress) {
                // この行でエラーが発生していた
                studentUpdate[progressKey] = newProgress;
              }
              studentUpdate[statusKey] = calcIcon(answer);
          }
        });
        return { ...student, ...studentUpdate };
      })
    );
  }, [lessonId, calcIcon, calcProgress]);

  // 5秒ごとのAPIポーリング (データの同期)
  useEffect(() => {
    if (!lessonId || !isRunning) return;

    fetchAllStudentsData(); 
    const intervalId = setInterval(fetchAllStudentsData, 5000);

    return () => clearInterval(intervalId);
  }, [lessonId, isRunning, fetchAllStudentsData]);

  // 1秒ごとのUIプログレスバー自動更新
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
              // [修正点] 型が正しく推論されるため `as number` が不要に
              const currentProgress = student[progressKey];
              const increment = 100 / (defaultMinutes * 60);
              const newProgress = Math.min(100, currentProgress + increment);
              
              if (currentProgress !== newProgress) {
                // この行でも同様のエラーが発生する可能性があった
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

  function calcPercentage(
    arr: { lectureView: string; confirm1: string; confirm2: string }[],
    key: "lectureView" | "confirm1" | "confirm2"
  ) {
    const total = arr.length;
    const doneCount = arr.filter((s) => s[key] === "done").length;
    return total > 0 ? (doneCount / total) * 100 : 0;
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

  function bgColorCheck(status: string) {
    if (status === "done") {
      return "p-2 border border-[#979191] bg-[#C6EFD0]";
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
      {/* 上部: 戻る + タイトル */}
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

      {/* 授業情報 */}
      <div className="text-gray-600 mb-2 flex justify-between">
        <div>
          <div>{dateInfoQuery}</div>
          <div>{contentInfoQuery}</div>
        </div>
        {/* タイマー */}
        <div
          className="m-4 w-24 h-24 border-4 border-blue-600 rounded-full flex items-center justify-center text-blue-600 text-lg font-bold cursor-pointer hover:opacity-80"
          title="クリックして時間を変更"
          onClick={handleChangeTimer}
        >
           {timeStr}
        </div>
      </div>

      {/* 上部ボタン */}
      <div className="flex items-center mb-2 gap-2 justify-end">
        {/* 授業開始（追加） */}
        <button
          className={`bg-blue-500 text-white px-3 py-1 rounded ${
            startingLesson || isLessonStarted ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-600"
          }`}
          disabled={startingLesson || isLessonStarted}
          onClick={lessonStart}
        >
          {startingLesson ? "開始処理中..." : (isLessonStarted ? "授業開始済み" : "授業開始")}
        </button>
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

      {/* メイン表 */}
      <div className="overflow-x-auto">
        <table className="border border-[#979191] text-sm min-w-max w-full">
          <thead className="bg-white">
            <tr>
              <th className="p-2 border border-[#979191]">出席番号</th>
              <th className="p-2 border border-[#979191]">名前</th>
              <th className="p-2 border border-[#979191]">講義視聴</th>
              <th className="p-2 border border-[#979191]">確認問題1</th>
              <th className="p-2 border border-[#979191]">確認問題2</th>
              <th className="p-2 border border-[#979191]">質問</th>
              <th className="p-2 border border-[#979191]">出席</th>
              <th className="p-2 border border-[#979191]">問題1</th>
              <th className="p-2 border border-[#979191]">問題2</th>
              <th className="p-2 border border-[#979191]">問題3</th>
              <th className="p-2 border border-[#979191]">問題4</th>
            </tr>
            {/* 割合バーの行 */}
            <tr className="bg-white text-xs">
              <td className="p-1 border border-[#979191] text-center"></td>
              <td className="p-1 border border-[#979191] text-center"></td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                  color="green"
                  bg="gray"
                  percentage={calcPercentage(students, "lectureView")}
                />
              </td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                  color="green"
                  bg="gray"
                  percentage={calcPercentage(students, "confirm1")}
                />
              </td>
              <td className="p-1 border border-[#979191]">
                <ProgressBarBar
                  color="green"
                  bg="gray"
                  percentage={calcPercentage(students, "confirm2")}
                />
              </td>
              <td className="p-1 border border-[#979191] text-center">
                {students.filter((s) => s.question).length}人
              </td>
              <td className="p-1 border border-[#979191] text-center">
                {students.filter((s) => s.attend).length}人
              </td>
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
              <tr key={st.no} className="text-center">
                <td className="p-2 border border-[#979191]">{st.no}</td>
                <td className="p-2 border border-[#979191]">{st.name}</td>
                <td className={bgColorCheck(st.lectureView)}>
                  <CellWithBar
                    icon={st.lectureView}
                    progress={st.lectureProgress}
                   />
                </td>
                <td className={bgColorCheck(st.confirm1)}>
                  <CellWithBar
                    icon={st.confirm1}
                    progress={st.confirm1Progress}
                  />
                </td>
                <td className={bgColorCheck(st.confirm2)}>
                  <CellWithBar
                    icon={st.confirm2}
                    progress={st.confirm2Progress}
                  />
                </td>
                <td className="p-2 border border-[#979191]">
                  {st.question && (
                    <span className="font-bold text-[#555454]">✓</span>
                  )}
                </td>
                <td className="p-2 border border-[#979191]">
                  {st.attend && (
                    <span className="font-bold text-[#555454]">✓</span>
                  )}
                </td>
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

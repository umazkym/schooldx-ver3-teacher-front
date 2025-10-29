// ファイル: src/app/realtime-dashboard/dashboard/page.tsx

"use client";
export const dynamic = "force-dynamic";
import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
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
    lesson_question_id: number; // <-- キー名を修正
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

// /grades/raw_data のレスポンスアイテムの型定義
interface RawDataItemFromGrades {
  student: {
    student_id: number;
    students_number: number;
    name: string;
  };
}


/**
 * ダッシュボード主要コンポーネント
 */
function DashboardPageContent() {
  const router = useRouter();

  const socketRef = useRef<Socket | null>(null);


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
  
  }, [lessonId]);

  // 修正2: 生徒データを保持する State と、動的マップ用の State/Ref を定義
  const [students, setStudents] = useState<Student[]>([]);
  const studentsRef = useRef(students);
  const [dynamicQuestionMap, setDynamicQuestionMap] = useState<{ [id: number]: { status: StudentStringKey, progress: StudentNumberKey } } | null>(null);
  const dynamicQuestionMapRef = useRef(dynamicQuestionMap);

  // 修正3: State が変更されたら Ref にも同期
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  useEffect(() => {
    dynamicQuestionMapRef.current = dynamicQuestionMap;
  }, [dynamicQuestionMap]);

  // 修正4: 生徒リストの初期化処理 (初回ロード時に一度だけ実行)
  useEffect(() => {
    if (!lessonId || !apiBaseUrl) return;

    // 生徒リストを取得する非同期関数
    const initializeStudents = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/grades/raw_data?lesson_id=${lessonId}`
        );
        if (!res.ok) throw new Error('Failed to fetch student list');
        const data: RawDataItemFromGrades[] = await res.json();

        // 生徒情報を一意に抽出
        const studentMap = new Map<number, Student>();
        data.forEach((item: RawDataItemFromGrades) => {
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

        // students_number でソートしてから state にセット
        const sortedStudents = Array.from(studentMap.values()).sort(
          (a, b) => a.students_number - b.students_number
        );
        setStudents(sortedStudents); // 生徒リストをセット

      } catch (err) {
        console.error('Failed to fetch student data:', err);
      }
    };

    initializeStudents();
  }, [lessonId]); // lessonId が変わったときだけ実行


  const srcDate = lessonInfo ?? lessonMeta;
  const dateInfoQuery = srcDate
    ? `${srcDate.date} (${srcDate.day_of_week}) / ${srcDate.period}限目 ${srcDate.lesson_name ?? ""}`
    : "ロード中...";
  const firstTheme = lessonInfo ? Object.values(lessonInfo.lesson_theme)[0] : undefined;
  const src = selectedContent ?? firstTheme;
  const contentInfoQuery = src
    ? `${src.lesson_theme_name} / ${src.material_name} ${src.part_name ?? ""} ${src.chapter_name ?? ""} ${src.unit_name ??
 ""}`.trim()
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

  const stopTimer = async () => {
    const themeId = selectedContent?.lesson_theme_id ??
      firstTheme?.lesson_theme_id;

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

  // calcIcon と calcProgress は変更なし
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

  // 修正5: fetchAllStudentsData を修正 (マッピングの動的生成を追加)
  const fetchAllStudentsData = useCallback(async () => {
    if (!lessonId || !apiBaseUrl) return;
    const currentStudents = studentsRef.current;
    if (currentStudents.length === 0) {
      // console.log("生徒データがまだロードされていません。スキップします。");
      return; // 生徒データがまだない場合は何もしない
    }

    const studentIds = currentStudents.map(s => s.id);

    // (A) 全生徒の回答データを取得 (既存ロジック)
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

    // (B) マッピングの決定
    let currentMap = dynamicQuestionMapRef.current;
    if (!currentMap) {
        // マップがまだない場合、取得したデータから動的に生成する
        const questionIds = new Set<number>();
        allStudentsData.forEach(result => {
            if (result.data) {
                result.data.forEach(answer => {
                    questionIds.add(answer.question.lesson_question_id);
                });
            }
        });

        // 取得した問題IDをソートし、q1, q2, q3, q4 に割り当てる
        const sortedQuestionIds = Array.from(questionIds).sort((a, b) => a - b);
        
        // 生徒側ログ（今回）の `question_id: 5, 6, 7, 8` に対応
        const newMap: { [id: number]: { status: StudentStringKey, progress: StudentNumberKey } } = {};
        const keys: { status: StudentStringKey, progress: StudentNumberKey }[] = [
            { status: 'q1', progress: 'q1Progress' },
            { status: 'q2', progress: 'q2Progress' },
            { status: 'q3', progress: 'q3Progress' },
            { status: 'q4', progress: 'q4Progress' },
        ];
        sortedQuestionIds.slice(0, 4).forEach((qId, index) => {
            newMap[qId] = keys[index];
        });
        console.log("動的マッピングを生成:", newMap);
        setDynamicQuestionMap(newMap); // Stateを更新
        currentMap = newMap; 
        // この実行サイクルでは更新された Ref の代わりにローカル変数を使う
    }

    // (C) 画面更新 (既存ロジックだが、参照するマップを変更)
    setStudents(prevStudents =>
      prevStudents.map(student => {
        const result = allStudentsData.find(d => d.studentId === student.id);
        if (!result || result.error || !result.data) {
          return student;
        }

        const studentUpdate: Partial<Student> = {};

        result.data.forEach(answer => {
          // ★★★ 修正箇所 ★★★
          // ハードコードされたマップの代わりに、動的に生成したマップ(currentMap)を参照する
          const keys = currentMap ? currentMap[answer.question.lesson_question_id] : undefined;
          
          if (keys) {
              const statusKey = keys.status;
              const progressKey = keys.progress;

              const newProgress = calcProgress(answer);
              const currentProgress = student[progressKey];

              // 解答中でない場合、または解答中で進捗が進んでいる場合のみ更新
              if (answer.answer_status !== 1 || newProgress >= currentProgress) {
                studentUpdate[progressKey] = newProgress;
              }
              studentUpdate[statusKey] = calcIcon(answer);
          }
        });
        // 既存の student データと更新データをマージ
        return { ...student, ...studentUpdate };
      })
    );
  }, [lessonId, calcIcon, calcProgress, apiBaseUrl]); // apiBaseUrl を依存配列に追加

  // Socket.IOイベントの購読ロジック
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    const handleSocketMessage = (data: string) => {
      console.log("🌐 Web recv from Flutter:", data);

      // バックエンドから 'student_answered,lessonId,studentId,answerDataId' 形式で飛んでくる
      const parts = data.split(',');
      const eventType = parts[0];

      // イベントタイプをチェック
      if (eventType === 'student_answered') {
        const receivedLessonId = parseInt(parts[1], 10);

        // 現在開いているダッシュボードの授業IDと一致する場合のみデータを再取得
        if (receivedLessonId === lessonId) {
          console.log(`Matching answer update received for lesson ${lessonId}. Refetching data.`);
          // ポーリングを待たずに即時データ取得を実行
          fetchAllStudentsData();
        } else {
          console.log(`Ignoring answer update for different lesson: ${receivedLessonId}`);
        }
      }

      // 他のイベントタイプ（例：'student_question'など）もここで処理できる
    };

    socket.on("connect", () =>
      console.log("🌐 Web connected (Dashboard)")
    );

    socket.on("from_flutter", handleSocketMessage);

    return () => {
      if (socketRef.current) {
        socketRef.current.off("connect");
        socketRef.current.off("from_flutter", handleSocketMessage);
      }
    };
  }, [fetchAllStudentsData, lessonId]);

  // 修正6: タイマー起動時の初回データ取得とポーリング設定
  useEffect(() => {
    // isRunning が false の時、または生徒リストが未ロードの時は何もしない
    if (!lessonId || !isRunning || students.length === 0) return; 

    // 演習開始（isRunning=true）時にまず1回実行
    fetchAllStudentsData();
    
    // その後、5秒ごとのポーリングを開始
    const intervalId = setInterval(fetchAllStudentsData, 5000);

    // クリーンアップ関数
    return () => clearInterval(intervalId);
  }, [lessonId, isRunning, fetchAllStudentsData, students.length]); // ★ fetchAllStudentsData, students.length を依存配列に追加


  // 修正7: リアルタイム進捗バー更新用のuseEffectを修正
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      // ★★★ 修正箇所 ★★★
      // ハードコードされたマップではなく、動的マップ(dynamicQuestionMapRef.current)を参照する
      const currentMap = dynamicQuestionMapRef.current;
      if (!currentMap) return; // マップがまだ生成されていなければ何もしない

      setStudents(prevStudents =>
        prevStudents.map(student => {
          const studentUpdate: Partial<Student> = {};

          // 動的マップのキー（問題ID）に基づいて処理
          Object.keys(currentMap).forEach(questionIdStr => {
            const qId = parseInt(questionIdStr, 10);
            const keyInfo = currentMap[qId];
            
            const statusKey = keyInfo.status;
            const progressKey = keyInfo.progress;
            
            if (student[statusKey] === 'pencil') {
              const currentProgress = student[progressKey];
              // 1秒あたりの進捗率を計算
              const increment = 100 / (defaultMinutes * 60);
              const newProgress = Math.min(100, currentProgress + increment);

              if (currentProgress !== newProgress) {
                studentUpdate[progressKey] = newProgress;
              }
            }
          });

          // 更新がある場合のみ新しいオブジェクトを返す
          if (Object.keys(studentUpdate).length > 0) {
              return { ...student, ...studentUpdate };
          }
          return student; // 更新がない場合は元のオブジェクトを返す
        })
      );
    }, 1000); // 1秒ごとに実行

    return () => clearInterval(timer);
  }, [isRunning, defaultMinutes]); // ★ dynamicQuestionMap を依存配列から削除（Ref経由で参照するため）


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
      // "done" は使われていないようなのでコメントアウト
      // case "done":
      //   return <span className="text-green-600 font-bold">✓</span>;
      case "correct":
        return <span className="text-green-600 font-bold">○</span>;
      case "wrong":
        return <span className="text-red-500 font-bold">×</span>;
      case "pencil":
        return <span className="text-[#555454]">✎</span>;
      // "checked" も使われていないようなのでコメントアウト
      // case "checked":
      //   return <span className="font-bold text-[#555454]">✓</span>;
      default:
        // 空白または初期状態を表す場合は何も表示しないか、'-' などを表示
        return <span className="text-gray-400">-</span>; // 例: 未回答時にハイフン表示
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
    if (sum === 0) return 0; // 回答者がいない場合は0%
    return (correctCount / sum) * 100;
  }

  // 正解・不正解に応じた背景色を返す関数
  function bgColorQA(status: string) {
    if (status === "correct") {
      return "p-2 border border-[#979191] bg-[#C6EFD0]"; // 正解: 緑背景
    }
    if (status === "wrong") {
      return "p-2 border border-[#979191] bg-[#FFD0D0]"; // 不正解: 赤背景
    }
    // デフォルトは白背景
    return "p-2 border border-[#979191] bg-white";
  }


  function ProgressBarBar({
    color,
    bg,
    percentage,
  }: {
    color: "green"; // 今は緑固定
    bg: "gray" | "red";
    percentage: number;
  }) {
    // パーセンテージを0-100の範囲に収める
    const clamped = Math.max(0, Math.min(100, percentage));
    return (
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mx-2">
        {/* 背景色（不正解部分）*/}
        {bg === "red" && (
          <div className="absolute top-0 left-0 w-full h-full bg-[#E76568]" /> // 赤背景
        )}
        {/* 背景色（未回答など、今は使われていない）*/}
        {bg === "gray" && (
          <div className="absolute top-0 left-0 w-full h-full bg-[#DBDBDB]" /> // グレー背景
        )}
        {/* 正解率バー */}
        {color === "green" && (
          <div
            className="absolute top-0 left-0 h-full bg-[#4CB64B]" // 緑バー
            style={{ width: `${clamped}%` }}
          />
        )}
        
        {/* 中央にパーセンテージ表示 */}
        <div className="absolute w-full h-full flex items-center justify-center text-xs text-white font-bold">
          {Math.round(clamped)}%
        </div>
      </div>
     );
  }


  return (
    <div>
      {/* 上部: 戻るボタン、タイトル、メッセージ */}
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

      {/* 授業情報とタイマー */}
      <div className="text-gray-600 mb-2 flex justify-between items-start">
        <div>
            <div>{dateInfoQuery}</div>
          <div>{contentInfoQuery}</div>
        </div>
        {/* タイマー表示 */}
        <div
          className="m-4 w-24 h-24 border-4 border-blue-600 rounded-full flex items-center justify-center text-blue-600 text-lg font-bold cursor-pointer hover:opacity-80"
          title="クリックして時間を変更"
          onClick={handleChangeTimer}
        >
          {timeStr}
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center mb-2 gap-2 justify-end">
        <button
          className={`bg-blue-500 text-white px-3 py-1 rounded ${!isLessonStarted ||
 isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
          onClick={startTimer}
          disabled={!isLessonStarted ||
 isRunning}
        >
          演習開始
        </button>
        <button
          className={`bg-blue-500 text-white px-3 py-1 rounded ${!isRunning ?
 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
           onClick={stopTimer}
           disabled={!isRunning}
        >
          演習終了
        </button>
        <button className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600">
          授業コンテンツ切り替え
        </button>
      </div>

      {/* 生徒一覧テーブル */}
        <div className="overflow-x-auto">
        <table className="border border-[#979191] text-sm min-w-max w-full">
          {/* テーブルヘッダー */}
          <thead className="bg-white">
            <tr>
              {/* ▼▼▼ 出席番号のカラムヘッダー ▼▼▼ */}
              <th className="p-2 border border-[#979191]">出席番号</th>
              {/* ▲▲▲ 変更ここまで ▲▲▲ */}
              <th className="p-2 border border-[#979191]">名前</th>
              <th className="p-2 border border-[#979191]">問題1</th>
              <th className="p-2 border border-[#979191]">問題2</th>
              <th className="p-2 border border-[#979191]">問題3</th>
              <th className="p-2 border border-[#979191]">問題4</th>
            </tr>
            {/* 正答率バー表示行 */}
            <tr className="bg-white text-xs">
              <td className="p-1 border border-[#979191] text-center"></td> {/* 出席番号列は空 */}
              <td className="p-1 border border-[#979191] text-center"></td> {/* 名前列は空 */}
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
          {/* テーブルボディ */}
          <tbody>
            {students.map((st) => (
              <tr key={st.id} className="text-center">
                {/* ▼▼▼ 出席番号を表示するセルを追加 ▼▼▼ */}
                <td className="p-2 border border-[#979191]">{st.students_number}</td>
                {/* ▲▲▲ 変更ここまで ▲▲▲ */}
                <td className="p-2 border border-[#979191]">{st.name}</td>
                {/* 各問題の解答状況セル */}
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
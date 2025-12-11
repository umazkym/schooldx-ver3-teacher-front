// ファイル: src/app/realtime-dashboard/dashboard/page.tsx
// 【修正済み・全文】

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
  answer_start_timestamp: string | null;  // フォールバック用のタイムスタンプ文字列
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
  q1StartUnix: number | null;
  q2: string;
  q2Progress: number;
  q2StartUnix: number | null;
  q3: string;
  q3Progress: number;
  q3StartUnix: number | null;
  q4: string;
  q4Progress: number;
  q4StartUnix: number | null;
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
  // ▼▼▼ 【修正】 class_id を追加 ▼▼▼
  class_id: number;
  // ▲▲▲ 【修正】 ▲▲▲
  date: string;
  day_of_week: string;
  period: number;
  lesson_name: string | null;
  lesson_theme: LessonThemeBlock[];  // APIはListを返す
}

// /grades/raw_data のレスポンスアイテムの型定義
// (initializeStudents では使わなくなったが、他で使われる可能性を考慮し残置)
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
    } catch { }
  }, []);
  useEffect(() => {
    if (!lessonId || !apiBaseUrl) return;
    (async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/lesson_attendance/lesson_information?lesson_id=${lessonId}`
        );
        if (!res.ok) {
          console.error(`lesson_information API failed: ${res.status}`);
          return;
        }
        const d = (await res.json()) as LessonInformation;
        setLessonInfo(d);
      } catch (err) {
        console.error('lesson_information fetch error:', err);
      }
    })();

  }, [lessonId]);

  // 修正2: 生徒データを保持する State と、動的マップ用の State/Ref を定義
  const [students, setStudents] = useState<Student[]>([]);
  const studentsRef = useRef(students);
  const [dynamicQuestionMap, setDynamicQuestionMap] = useState<{
    [id: number]: {
      status: StudentStringKey,
      progress: StudentNumberKey,
      startUnix: StudentNumberKey | keyof Pick<Student, 'q1StartUnix' | 'q2StartUnix' | 'q3StartUnix' | 'q4StartUnix'>
    }
  } | null>(null);
  const dynamicQuestionMapRef = useRef(dynamicQuestionMap);

  // サーバー時刻とクライアント時刻のオフセットを保存（ミリ秒単位）
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const timeOffsetRef = useRef(timeOffset);

  // サーバー時刻を取得する関数（クライアント時刻のズレを考慮）
  const getServerUnixTime = useCallback(() => {
    return Math.floor((Date.now() + timeOffsetRef.current) / 1000);
  }, []);

  // 修正3: State が変更されたら Ref にも同期
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  useEffect(() => {
    dynamicQuestionMapRef.current = dynamicQuestionMap;
  }, [dynamicQuestionMap]);
  useEffect(() => {
    timeOffsetRef.current = timeOffset;
  }, [timeOffset]);

  // ▼▼▼▼▼ 【修正】 生徒リストの初期化処理 (lessonInfo取得後に実行) ▼▼▼▼▼
  useEffect(() => {
    // lessonId と lessonInfo (特に lessonInfo.class_id) がないと実行できない
    if (!lessonId || !apiBaseUrl || !lessonInfo) return;

    // 生徒リストを取得する非同期関数
    const initializeStudents = async () => {
      try {
        // ★修正★ /classes/{class_id}/students APIを叩く
        const res = await fetch(
          `${apiBaseUrl}/classes/${lessonInfo.class_id}/students`
        );
        if (!res.ok) {
          // クラスに生徒がいない場合、APIは空リスト[]を返す（classes.py L.43 参照）
          // もし404や他のエラーが返った場合
          if (res.status === 404) {
            console.warn(`生徒データが見つかりません (class_id: ${lessonInfo.class_id})`);
            setStudents([]); // 空のリストをセット
            return;
          }
          throw new Error(`Failed to fetch student list (Status: ${res.status})`);
        }

        // ★修正★ /classes/{class_id}/students のレスポンス型 (StudentInfo[])
        // schemas.py L.226 StudentInfo (student_id, name, class_id, students_number)
        const data: {
          student_id: number;
          name: string;
          class_id: number;
          students_number: number;
        }[] = await res.json();

        // 取得した生徒データで students state を初期化
        const initialStudents: Student[] = data.map(item => ({
          id: item.student_id,
          students_number: item.students_number,
          name: item.name,
          q1: '',
          q1Progress: 0,
          q1StartUnix: null,
          q2: '',
          q2Progress: 0,
          q2StartUnix: null,
          q3: '',
          q3Progress: 0,
          q3StartUnix: null,
          q4: '',
          q4Progress: 0,
          q4StartUnix: null,
        }));

        // APIは既に出席番号順でソートされているはず (classes.py L.38)
        setStudents(initialStudents); // 生徒リストをセット

      } catch (err) {
        console.error('Failed to fetch student data:', err);
        setStudents([]); // エラー時も空リストをセット
      }
    };

    initializeStudents();
  }, [lessonId, lessonInfo, apiBaseUrl]); // ★ lessonInfo と apiBaseUrl を依存配列に追加
  // ▲▲▲▲▲ 【修正】 ここまで ▲▲▲▲▲


  const srcDate = lessonInfo ?? lessonMeta;
  const dateInfoQuery = srcDate
    ? `${srcDate.date} (${srcDate.day_of_week}) / ${srcDate.period}限目 ${srcDate.lesson_name ?? ""}`
    : "ロード中...";
  const firstTheme = lessonInfo?.lesson_theme?.[0];
  const src = selectedContent ?? firstTheme;
  const contentInfoQuery = src
    ? `${src.material_name}/${src.part_name ?? ""}/${src.chapter_name ?? ""}/${src.unit_name ?? ""}/${src.lesson_theme_name}`.trim()
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
      const res = await fetch(`${apiBaseUrl}/api/lesson_themes/${lessonId}/${themeId}/start_exercise`, {
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
      const res = await fetch(`${apiBaseUrl}/api/lesson_themes/${lessonId}/${themeId}/end_exercise`, {
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

  // ヘルパー関数: answer_start_unixまたはanswer_start_timestampからUnixタイムスタンプを取得
  const getStartUnix = useCallback((d?: AnswerDataWithDetails): number | null => {
    if (!d) return null;

    // answer_start_unixが設定されていればそれを使用
    if (d.answer_start_unix != null && d.answer_start_unix > 0) {
      const clientNowUnix = Math.floor(Date.now() / 1000);

      // 初回APIレスポンス時にサーバー時刻のオフセットを計算
      if (timeOffsetRef.current === 0) {
        // タイムスタンプが現在時刻と大きくずれている場合、オフセットを設定
        // answer_start_unixは最近の時刻のはずなので、1時間以上のズレがあれば異常
        const rawDiff = clientNowUnix - d.answer_start_unix;

        // マイナス（未来）の場合、またはプラスで大きすぎる場合
        if (rawDiff < -3600 || (rawDiff < 0 && Math.abs(rawDiff) > 60)) {
          const estimatedOffset = (d.answer_start_unix - clientNowUnix) * 1000; // ミリ秒に変換
          console.log(`🕐 Detected time offset: ${(estimatedOffset / 1000 / 60).toFixed(1)} minutes (${(estimatedOffset / 1000).toFixed(0)}s). Adjusting client time.`);
          setTimeOffset(estimatedOffset);
          timeOffsetRef.current = estimatedOffset;
        }
      }

      const serverNowUnix = getServerUnixTime();
      const diff = serverNowUnix - d.answer_start_unix;

      // console.log(`📅 Using answer_start_unix: ${d.answer_start_unix}, client: ${clientNowUnix}, server: ${serverNowUnix}, diff: ${diff}s (${(diff/60).toFixed(1)}min), offset: ${timeOffsetRef.current/1000}s`);

      // 未来のタイムスタンプや異常な値の警告（サーバー時刻基準）
      if (diff < -60) {
        console.warn(`⚠️ WARNING: Timestamp is in the future by ${Math.abs(diff)}s!`);
      } else if (diff > 86400) {
        console.warn(`⚠️ WARNING: Timestamp is more than 24 hours old!`);
      }

      return d.answer_start_unix;
    }

    // answer_start_timestampが設定されていればそれを変換して使用
    if (d.answer_start_timestamp) {
      try {
        // Flutter側から "2025-11-01 23:44:23.820" のような形式で来る場合に対応
        // ISO 8601形式に変換 (スペースをTに置換、Zを追加してUTCとして扱う)
        let isoString = d.answer_start_timestamp.trim();

        // スペース区切りの場合、ISO形式に変換
        if (isoString.includes(' ')) {
          isoString = isoString.replace(' ', 'T');
        }

        // タイムゾーン情報がない場合、ローカルタイムとして扱う
        const date = new Date(isoString);

        // 日付が無効でないかチェック
        if (isNaN(date.getTime())) {
          console.error('Invalid timestamp format:', d.answer_start_timestamp);
          return null;
        }

        const unixTimestamp = Math.floor(date.getTime() / 1000);
        // const nowUnix = Math.floor(Date.now() / 1000);
        // const diff = nowUnix - unixTimestamp;
        // console.log(`Converted timestamp: ${d.answer_start_timestamp} -> ${unixTimestamp}, diff: ${diff}s`);

        return unixTimestamp;
      } catch (error) {
        console.error('Error parsing timestamp:', d.answer_start_timestamp, error);
        return null;
      }
    }

    return null;
  }, [getServerUnixTime]);

  // calcIcon: 解答のステータスに応じたアイコンを返す
  // answer_start_unixまたはanswer_start_timestampが設定されているかチェック
  const calcIcon = useCallback((d?: AnswerDataWithDetails) => {
    if (!d || d.answer_status === 0) return "";
    // 開始タイムスタンプが設定されていない場合は、まだ解答開始していない
    const startUnix = getStartUnix(d);
    if (startUnix == null || startUnix === 0) return "";
    if (d.answer_status === 1) return "pencil";
    if (d.answer_status === 2) {
      if (d.answer_correctness === 0) return "wrong";
      if (d.answer_correctness === 1) return "correct";
    }
    return "";
  }, [getStartUnix]);

  const calcProgress = useCallback((d?: AnswerDataWithDetails) => {
    const startUnix = getStartUnix(d);
    if (!d || startUnix == null || startUnix === 0) return 0;

    if (d.answer_end_unix != null && d.answer_end_unix > 0) {
      const diff = d.answer_end_unix - startUnix;
      return Math.min(100, (diff / (defaultMinutes * 60)) * 100);
    }

    if (d.answer_status === 1) {
      const nowUnix = getServerUnixTime(); // サーバー時刻を使用
      const diff = nowUnix - startUnix;

      return Math.min(100, (diff / (defaultMinutes * 60)) * 100);
    }

    return 0;
  }, [defaultMinutes, getStartUnix, getServerUnixTime]);

  // ▼▼▼▼▼ 【修正】 fetchAllStudentsData を修正 (API呼び出しを1回に変更) ▼▼▼▼▼
  const fetchAllStudentsData = useCallback(async () => {
    if (!lessonId || !apiBaseUrl) return;
    const currentStudents = studentsRef.current;
    if (currentStudents.length === 0) {
      // console.log("生徒データがまだロードされていません。スキップします。");
      return; // 生徒データがまだない場合は何もしない
    }

    // (A) 全生徒の回答データを1回のAPI呼び出しで取得
    let allAnswersData: AnswerDataWithDetails[] = [];
    try {
      const url = `${apiBaseUrl}/api/answers/?lesson_id=${lessonId}`; // ★ student_id を除去
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          console.log("回答データがまだありません (404)");
          allAnswersData = []; // データがなければ空配列
        } else {
          console.error(`Error fetching all answers data: ${res.status}`);
          return; // エラー時は更新しない
        }
      } else {
        allAnswersData = await res.json();
      }

      // デバッグ: APIから取得した生データを確認
      if (allAnswersData.length > 0) {
        console.log('🔍 Raw API response (ALL STUDENTS):', allAnswersData.length, 'records');
      }

    } catch (error) {
      console.error(`Error fetching all answers data:`, error);
      return; // エラー時は更新しない
    }

    // (B) マッピングの決定
    let currentMap = dynamicQuestionMapRef.current;
    if (!currentMap) {
      // マップがまだない場合、取得したデータから動的に生成する
      const questionIds = new Set<number>();
      // ★修正★ allAnswersData を直接イテレート
      allAnswersData.forEach(answer => {
        questionIds.add(answer.question.lesson_question_id);
      });

      // 取得した問題IDをソートし、q1, q2, q3, q4 に割り当てる
      const sortedQuestionIds = Array.from(questionIds).sort((a, b) => a - b);

      const newMap: {
        [id: number]: {
          status: StudentStringKey,
          progress: StudentNumberKey,
          startUnix: keyof Pick<Student, 'q1StartUnix' | 'q2StartUnix' | 'q3StartUnix' | 'q4StartUnix'>
        }
      } = {};
      const keys: {
        status: StudentStringKey,
        progress: StudentNumberKey,
        startUnix: keyof Pick<Student, 'q1StartUnix' | 'q2StartUnix' | 'q3StartUnix' | 'q4StartUnix'>
      }[] = [
          { status: 'q1', progress: 'q1Progress', startUnix: 'q1StartUnix' },
          { status: 'q2', progress: 'q2Progress', startUnix: 'q2StartUnix' },
          { status: 'q3', progress: 'q3Progress', startUnix: 'q3StartUnix' },
          { status: 'q4', progress: 'q4Progress', startUnix: 'q4StartUnix' },
        ];
      sortedQuestionIds.slice(0, 4).forEach((qId, index) => {
        newMap[qId] = keys[index];
      });
      console.log("動的マッピングを生成:", newMap);
      setDynamicQuestionMap(newMap); // Stateを更新
      currentMap = newMap;
      // この実行サイクルでは更新された Ref の代わりにローカル変数を使う
    }

    // (C) 画面更新 (全生徒データをマッピング)
    setStudents(prevStudents => {
      // 回答データを生徒IDごとにグループ化
      const answersByStudent = new Map<number, AnswerDataWithDetails[]>();
      allAnswersData.forEach(answer => {
        if (!answersByStudent.has(answer.student_id)) {
          answersByStudent.set(answer.student_id, []);
        }
        answersByStudent.get(answer.student_id)!.push(answer);
      });

      // prevStudents (生徒の枠) を元に更新
      return prevStudents.map(student => {
        const answers = answersByStudent.get(student.id);

        // この生徒の回答データがない場合は、既存のstudentをそのまま返す
        if (!answers || answers.length === 0) {
          return student;
        }

        const studentUpdate: Partial<Student> = {};

        answers.forEach(answer => {
          // ハードコードされたマップの代わりに、動的に生成したマップ(currentMap)を参照する
          const keys = currentMap ? currentMap[answer.question.lesson_question_id] : undefined;

          if (keys) {
            const statusKey = keys.status;
            const progressKey = keys.progress;
            const startUnixKey = keys.startUnix;

            const newProgress = calcProgress(answer);
            // const currentProgress = student[progressKey];

            // プログレスバーを常に更新（pencil状態でも確実に更新されるように）
            studentUpdate[progressKey] = newProgress;

            // statusの更新: 一度「正解」または「不正解」になった問題は、statusを変更しない
            const currentStatus = student[statusKey];
            const newStatus = calcIcon(answer);

            // answer_start_unixを保存（リアルタイム進捗バー更新に使用）
            const startUnixValue = getStartUnix(answer);
            (studentUpdate as Record<string, number | null>)[startUnixKey] = startUnixValue;

            // デバッグ: startUnixの保存状況を確認
            if (startUnixValue) {
              // console.log(`Student ${student.id} - ${statusKey}: startUnix set to ${startUnixValue}, status: ${newStatus}`);
            } else {
              // console.warn(`Student ${student.id} - ${statusKey}: startUnix is null!`, {
              //   answer_start_unix: answer.answer_start_unix,
              //   answer_start_timestamp: answer.answer_start_timestamp
              // });
            }

            // 現在のstatusが「correct」または「wrong」の場合は、新しいstatusに上書きしない
            if (currentStatus !== 'correct' && currentStatus !== 'wrong') {
              studentUpdate[statusKey] = newStatus;
            }
          }
        });
        // 既存の student データと更新データをマージ
        return { ...student, ...studentUpdate };
      })
    });
  }, [lessonId, calcIcon, calcProgress, getStartUnix, apiBaseUrl]);
  // ▲▲▲▲▲ 【修正】 ここまで ▲▲▲▲▲

  // ▼▼▼▼▼ 【新規】 60秒ポーリング用: DBの値で全問題を強制上書き ▼▼▼▼▼
  const fetchAndOverwriteAllData = useCallback(async () => {
    if (!lessonId || !apiBaseUrl) return;
    const currentStudents = studentsRef.current;
    if (currentStudents.length === 0) return;

    console.log('🔄 60秒ポーリング: 全問題をDBの値で強制上書き開始');

    let allAnswersData: AnswerDataWithDetails[] = [];
    try {
      const url = `${apiBaseUrl}/api/answers/?lesson_id=${lessonId}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          allAnswersData = [];
        } else {
          console.error(`Error fetching all answers data: ${res.status}`);
          return;
        }
      } else {
        allAnswersData = await res.json();
      }
    } catch (error) {
      console.error(`Error fetching all answers data:`, error);
      return;
    }

    const currentMap = dynamicQuestionMapRef.current;
    if (!currentMap) {
      console.log('60秒ポーリング: マップがまだ生成されていないためスキップ');
      return;
    }

    // DBの値で強制上書き（保護ロジックなし）
    setStudents(prevStudents => {
      const answersByStudent = new Map<number, AnswerDataWithDetails[]>();
      allAnswersData.forEach(answer => {
        if (!answersByStudent.has(answer.student_id)) {
          answersByStudent.set(answer.student_id, []);
        }
        answersByStudent.get(answer.student_id)!.push(answer);
      });

      return prevStudents.map(student => {
        const answers = answersByStudent.get(student.id);
        if (!answers || answers.length === 0) {
          return student;
        }

        const studentUpdate: Partial<Student> = {};

        answers.forEach(answer => {
          const keys = currentMap[answer.question.lesson_question_id];
          if (keys) {
            const statusKey = keys.status;
            const progressKey = keys.progress;
            const startUnixKey = keys.startUnix;

            // DBの値で強制上書き（保護なし）
            studentUpdate[progressKey] = calcProgress(answer);
            studentUpdate[statusKey] = calcIcon(answer);
            const startUnixValue = getStartUnix(answer);
            (studentUpdate as Record<string, number | null>)[startUnixKey] = startUnixValue;
          }
        });

        return { ...student, ...studentUpdate };
      });
    });

    console.log('🔄 60秒ポーリング: 強制上書き完了');
  }, [lessonId, calcIcon, calcProgress, getStartUnix, apiBaseUrl]);
  // ▲▲▲▲▲ 【新規】 ここまで ▲▲▲▲▲

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

    // 5秒ごとのポーリング（解答中の進捗更新用）
    // correct/wrongは保護されたまま、pencilの問題のみ更新される
    const fastIntervalId = setInterval(fetchAllStudentsData, 5000);

    // 60秒ごとのポーリング（全問題を強制上書き）
    // DBの値を正として、correct/wrongも含め全問題を上書き
    const slowIntervalId = setInterval(fetchAndOverwriteAllData, 60000);

    // クリーンアップ関数
    return () => {
      clearInterval(fastIntervalId);
      clearInterval(slowIntervalId);
    };
  }, [lessonId, isRunning, fetchAllStudentsData, fetchAndOverwriteAllData, students.length]);


  // リアルタイム進捗バー更新: 解答中（status='pencil'）の問題の進捗をリアルタイムに更新
  useEffect(() => {
    if (!isRunning) return;

    const nowMs = Date.now();
    const nowUnix = Math.floor(nowMs / 1000);
    const nowDate = new Date(nowMs);
    console.log('🔄 Real-time progress update timer started');
    console.log('🕐 Browser current time:', {
      unix: nowUnix,
      iso: nowDate.toISOString(),
      local: nowDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    const timer = setInterval(() => {
      const currentMap = dynamicQuestionMapRef.current;
      const tickNow = Math.floor(Date.now() / 1000);
      // console.log(`⏱️ Updating progress (5s tick). Map exists: ${!!currentMap}, current unix: ${tickNow}`);
      // currentMapがnullの場合でも、固定キー（q1, q2, q3, q4）で進捗を更新

      setStudents(prevStudents =>
        prevStudents.map(student => {
          const studentUpdate: Partial<Student> = {};
          let hasUpdate = false;

          // 動的マップが存在する場合は、マップに基づいて処理
          if (currentMap) {
            Object.keys(currentMap).forEach(questionIdStr => {
              const qId = parseInt(questionIdStr, 10);
              const keyInfo = currentMap[qId];

              const statusKey = keyInfo.status;
              const progressKey = keyInfo.progress;
              const startUnixKey = keyInfo.startUnix;

              // 解答中（status='pencil'）かつanswer_start_unixが設定されている場合のみ更新
              if (student[statusKey] === 'pencil') {
                if (student[startUnixKey] != null && student[startUnixKey] > 0) {
                  const startUnix = student[startUnixKey] as number;
                  const nowUnix = getServerUnixTime(); // サーバー時刻を使用
                  const diff = nowUnix - startUnix;
                  const newProgress = Math.min(100, (diff / (defaultMinutes * 60)) * 100);

                  // console.log(`📊 Student ${student.id} - ${statusKey}: progress ${student[progressKey]}% -> ${newProgress.toFixed(1)}% (diff: ${diff}s)`);

                  // 進捗が変わった場合のみ更新
                  if (newProgress !== student[progressKey]) {
                    studentUpdate[progressKey] = newProgress;
                    hasUpdate = true;
                  }
                } else {
                  // console.warn(`⚠️ Student ${student.id} - ${statusKey}: pencil status but no startUnix (${student[startUnixKey]})`);
                }
              }
            });
          } else {
            // マップがまだ生成されていない場合は、固定キーで更新
            const fixedKeys: Array<{
              status: StudentStringKey,
              progress: StudentNumberKey,
              startUnix: keyof Pick<Student, 'q1StartUnix' | 'q2StartUnix' | 'q3StartUnix' | 'q4StartUnix'>
            }> = [
                { status: 'q1', progress: 'q1Progress', startUnix: 'q1StartUnix' },
                { status: 'q2', progress: 'q2Progress', startUnix: 'q2StartUnix' },
                { status: 'q3', progress: 'q3Progress', startUnix: 'q3StartUnix' },
                { status: 'q4', progress: 'q4Progress', startUnix: 'q4StartUnix' },
              ];

            fixedKeys.forEach(keyInfo => {
              const statusKey = keyInfo.status;
              const progressKey = keyInfo.progress;
              const startUnixKey = keyInfo.startUnix;

              // 解答中（status='pencil'）かつanswer_start_unixが設定されている場合のみ更新
              if (student[statusKey] === 'pencil') {
                if (student[startUnixKey] != null && student[startUnixKey] > 0) {
                  const startUnix = student[startUnixKey] as number;
                  const nowUnix = getServerUnixTime(); // サーバー時刻を使用
                  const diff = nowUnix - startUnix;
                  const newProgress = Math.min(100, (diff / (defaultMinutes * 60)) * 100);

                  // console.log(`📊 [Fixed] Student ${student.id} - ${statusKey}: progress ${student[progressKey]}% -> ${newProgress.toFixed(1)}% (diff: ${diff}s)`);

                  // 進捗が変わった場合のみ更新
                  if (newProgress !== student[progressKey]) {
                    studentUpdate[progressKey] = newProgress;
                    hasUpdate = true;
                  }
                } else {
                  // console.warn(`⚠️ [Fixed] Student ${student.id} - ${statusKey}: pencil status but no startUnix (${student[startUnixKey]})`);
                }
              }
            });
          }

          // 更新がある場合のみ新しいオブジェクトを返す
          return hasUpdate ? { ...student, ...studentUpdate } : student;
        })
      );
    }, 5000); // 5秒ごとに実行

    return () => clearInterval(timer);
  }, [isRunning, defaultMinutes, getServerUnixTime]);


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

  // 高視認性の解答状況セル（教室後方からも見やすい）
  function AnswerStatusCell({ label, status }: { label: string; status: string }) {
    // 正解: 鮮やかな緑 + チェックマーク
    if (status === "correct") {
      return (
        <div className="flex flex-col items-center justify-center rounded-md bg-emerald-500 text-white h-full min-h-[50px]">
          <span className="text-xs font-medium opacity-80">Q{label}</span>
          <span className="text-2xl font-bold">✓</span>
        </div>
      );
    }
    // 不正解: 鮮やかな赤 + バツマーク
    if (status === "wrong") {
      return (
        <div className="flex flex-col items-center justify-center rounded-md bg-red-500 text-white h-full min-h-[50px]">
          <span className="text-xs font-medium opacity-80">Q{label}</span>
          <span className="text-2xl font-bold">✗</span>
        </div>
      );
    }
    // 解答中: 黄色 + 鉛筆アイコン
    if (status === "pencil") {
      return (
        <div className="flex flex-col items-center justify-center rounded-md bg-amber-400 text-white h-full min-h-[50px]">
          <span className="text-xs font-medium opacity-80">Q{label}</span>
          <span className="text-xl">...</span>
        </div>
      );
    }
    // 未回答: グレー
    return (
      <div className="flex flex-col items-center justify-center rounded-md bg-gray-200 text-gray-500 h-full min-h-[50px]">
        <span className="text-xs font-medium opacity-60">Q{label}</span>
        <span className="text-xl">─</span>
      </div>
    );
  }

  // コンパクトなステータスバッジ（人数が多い時用）
  function StatusBadge({ status }: { status: string }) {
    if (status === "correct") {
      return (
        <div className="flex items-center justify-center rounded bg-[#C6EFD0] text-[#22C55E] h-6 text-sm font-bold">
          ✓
        </div>
      );
    }
    if (status === "wrong") {
      return (
        <div className="flex items-center justify-center rounded bg-[#FFD0D0] text-[#EF4444] h-6 text-sm font-bold">
          ✗
        </div>
      );
    }
    if (status === "pencil") {
      return (
        <div className="flex items-center justify-center rounded bg-amber-100 text-amber-600 h-6 text-xs">
          ...</div>
      );
    }
    return (
      <div className="flex items-center justify-center rounded bg-gray-100 text-gray-400 h-6 text-xs">
        ─
      </div>
    );
  }

  // 大きな正誤表示セル（後方からも見やすい）
  function LargeStatusCell({ label, status }: { label: string; status: string }) {
    // 正解: 緑背景 + 大きなチェック
    if (status === "correct") {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg bg-[#22C55E] text-white py-2">
          <span className="text-[10px] font-medium opacity-90">Q{label}</span>
          <span className="text-xl font-bold leading-none">✓</span>
        </div>
      );
    }
    // 不正解: 赤背景 + 大きなバツ
    if (status === "wrong") {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg bg-[#EF4444] text-white py-2">
          <span className="text-[10px] font-medium opacity-90">Q{label}</span>
          <span className="text-xl font-bold leading-none">✗</span>
        </div>
      );
    }
    // 解答中: オレンジ背景 + 鉛筆（点滅）
    if (status === "pencil") {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg bg-[#F59E0B] text-white py-2">
          <span className="text-[10px] font-medium opacity-90">Q{label}</span>
          <span className="text-lg leading-none">...</span>
        </div>
      );
    }
    // 未回答: グレー背景
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-gray-200 text-gray-400 py-2">
        <span className="text-[10px] font-medium opacity-60">Q{label}</span>
        <span className="text-lg leading-none">─</span>
      </div>
    );
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
        <div className="border border-blue-100 bg-blue-50 p-2 rounded min-w-[500px] text-center">
          {message}
        </div>
      </div>

      {/* 授業情報とタイマー */}
      <div className="text-gray-600 mb-2 flex justify-between items-start">
        <div>
          <div className="text-lg">{dateInfoQuery}</div>
          <div>{contentInfoQuery}</div>
        </div>
        {/* タイマー表示 */}
        <div className="flex items-center gap-6">
          <div
            className="w-20 h-20 border-4 border-[#285AC8] rounded-full flex items-center justify-center text-[#285AC8] text-xl font-bold cursor-pointer hover:bg-blue-50"
            title="クリックして時間を変更"
            onClick={handleChangeTimer}
          >
            {timeStr}
          </div>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded font-bold text-white ${!isLessonStarted || isRunning
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#285AC8] hover:bg-blue-700'}`}
              onClick={startTimer}
              disabled={!isLessonStarted || isRunning}
            >
              演習開始
            </button>
            <button
              className={`px-4 py-2 rounded font-bold text-white ${!isRunning
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600'}`}
              onClick={stopTimer}
              disabled={!isRunning}
            >
              演習終了
            </button>
          </div>
        </div>
      </div>

      {/* 正答率サマリーバー */}
      <div className="flex items-center justify-between mb-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
        <span className="font-bold text-gray-700">正答率</span>
        <div className="flex gap-4">
          {[
            { label: '問題1', key: 'q1' as const },
            { label: '問題2', key: 'q2' as const },
            { label: '問題3', key: 'q3' as const },
            { label: '問題4', key: 'q4' as const },
          ].map(({ label, key }) => {
            const pct = Math.round(calcQAPercentage(students, key));
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{label}:</span>
                <div className="w-24 h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4CB64B] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`font-bold min-w-[40px] text-right ${pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-sm text-gray-500">回答者: {students.filter(s => s.q1 === 'correct' || s.q1 === 'wrong' || s.q1 === 'pencil').length} / {students.length}名</span>
      </div>
      {/* 生徒一覧 - 横配置で視認性向上 */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${students.length <= 8 ? 4 :
            students.length <= 15 ? 5 :
              students.length <= 24 ? 6 :
                students.length <= 35 ? 7 :
                  8
            }, minmax(0, 1fr))`
        }}
      >
        {students.map((st) => (
          <div
            key={st.id}
            className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
          >
            {/* 出席番号と名前 - 横配置 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-2xl font-black text-[#285AC8]">{st.students_number}</span>
              <span className="text-base font-medium text-gray-700 truncate flex-1">{st.name}</span>
            </div>
            {/* 問題1-4の正誤表示 - 大きく見やすく */}
            <div className="grid grid-cols-4 gap-1 p-2">
              <LargeStatusCell label="1" status={st.q1} />
              <LargeStatusCell label="2" status={st.q2} />
              <LargeStatusCell label="3" status={st.q3} />
              <LargeStatusCell label="4" status={st.q4} />
            </div>
          </div>
        ))}
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
// src/app/grades/page.tsx
"use client"
import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { apiBaseUrl } from '@/lib/apiConfig';

// --- 型定義 ---
type ClassData = { class_id: number; class_name: string; grade: number; };
type LessonData = { lesson_id: number; lesson_name: string; date: string; period: number; };

type LessonCalendarItem = {
    timetable_id: number;
    date: string;
    day_of_week: string;
    period: number;
    time: string;
    lesson_id: number | null;
    class_id: number | null;
    class_name: string | null;
    lesson_name: string | null;
    delivery_status: boolean;
    lesson_status: boolean;
};

type RawDataItem = {
    student: { student_id: number; name: string; class_id: number; students_number: number; }; // students_number を追加
    question: {
        question_id: number;
        question_label: string;
        correct_choice: string;
        part_name: string | null;
        chapter_name: string | null;
        unit_name: string | null;
        lesson_theme_name: string | null;
        lesson_theme_contents_id: number | null; // ★ 追加
    };
    answer: { selected_choice: string | null; is_correct: boolean | null; start_unix: number | null; end_unix: number | null; };
};

type GradeSummaryItem = {
    question_id: number;
    question_label: string;
    total_answers: number;
    correct_answers: number;
    correct_rate: number;
};

type CommentData = { student_id: number; student_name: string; comment_text: string | null; };

type QuestionStats = {
    question_id: number;
    question_label: string;
    part_name: string | null;
    chapter_name: string | null;
    unit_name: string | null;
    lesson_theme_name: string | null;
    lesson_theme_contents_id: number | null; // ★ 追加
    correct: number;
    total: number;
    choiceDistribution: { [choice: string]: number };
    correctChoice: string;
    correctTimes: number[];
    incorrectTimes: number[];
};

/**
 * @returns {number} 現在の年度 (例: 2025)
 */
const getCurrentAcademicYear = (): number => {
    const today = new Date();
    // 1月, 2月, 3月 (0, 1, 2) の場合は、前年の西暦が年度となる
    return today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
};

export default function GradesPage() {
    const router = useRouter();

    // --- State管理 ---
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>("");
    const [lessons, setLessons] = useState<LessonData[]>([]);
    const [selectedLessonId, setSelectedLessonId] = useState<string>("");
    const [rawData, setRawData] = useState<RawDataItem[]>([]);
    const [comments, setComments] = useState<CommentData[]>([]);
    const [gradeSummary, setGradeSummary] = useState<GradeSummaryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedAcademicYear, setSelectedAcademicYear] = useState<number>(getCurrentAcademicYear);
    const [availableYears, setAvailableYears] = useState<number[]>([]);

    useEffect(() => {
        const currentYear = getCurrentAcademicYear();
        const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
        setAvailableYears(years);
    }, []);

    // --- APIデータ取得 ---
    useEffect(() => {
        if (!apiBaseUrl) return;
        const fetchClasses = async () => {
            setError(null); // エラーをリセット
            try {
                // ▼▼▼ 修正箇所: URLの末尾にスラッシュを追加 ▼▼▼
                const res = await fetch(`${apiBaseUrl}/classes/`);
                // ▲▲▲ 修正ここまで ▲▲▲
                if (!res.ok) {
                    // エラーレスポンスの内容を取得
                    const errorText = await res.text();
                    console.error("Failed to fetch classes:", res.status, errorText);
                    throw new Error(`クラス一覧の取得に失敗しました (Status: ${res.status})`);
                }
                const data = await res.json();
                setClasses(data);
                if (data.length > 0 && !selectedClassId) { // selectedClassIdが未設定の場合のみ初期値を設定
                    setSelectedClassId(String(data[0].class_id));
                }
            } catch (error) {
                console.error("fetchClasses error:", error);
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchClasses();
        // apiBaseUrlが変更されたときに再実行するように依存配列に追加
    }, [apiBaseUrl]); // 依存配列に apiBaseUrl を追加

    useEffect(() => {
        // selectedClassId または selectedAcademicYear が未選択なら何もしない
        if (!selectedClassId || !apiBaseUrl || !selectedAcademicYear) {
            setLessons([]);
            setSelectedLessonId("");
            return;
        }
        const fetchLessons = async () => {
            setError(null); // エラーをリセット
            try {
                const url = `${apiBaseUrl}/lesson_registrations/calendar?academic_year=${selectedAcademicYear}&class_id=${selectedClassId}`;
                const res = await fetch(url);
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error("Failed to fetch lessons:", res.status, errorText);
                    throw new Error(`授業一覧の取得に失敗しました (Status: ${res.status})`);
                }

                const data: LessonCalendarItem[] = await res.json();
                const filteredData = data.filter((item): item is LessonCalendarItem & { lesson_id: number } => item.lesson_id != null);

                setLessons(filteredData.map((item) => ({
                    lesson_id: item.lesson_id,
                    lesson_name: item.lesson_name || "物理",
                    date: item.date,
                    period: item.period
                })));

                // 授業リストが更新されたら、選択中の授業をリセット
                setSelectedLessonId("");
            } catch (error) {
                console.error("fetchLessons error:", error);
                // エラーが発生した場合もリストと選択を空にする
                setLessons([]);
                setSelectedLessonId("");
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchLessons();
    }, [selectedClassId, selectedAcademicYear, apiBaseUrl]); // 依存配列に apiBaseUrl を追加

    useEffect(() => {
        // selectedLessonId が未選択なら何もしない
        if (!selectedLessonId || !apiBaseUrl) {
            setRawData([]);
            setComments([]);
            setGradeSummary([]);
            return;
        };
        const fetchGradesData = async () => {
            setLoading(true);
            setError(null);
            try {
                const currentClass = classes.find(c => c.class_id === parseInt(selectedClassId));
                const academic_year = selectedAcademicYear;
                // currentClassが存在しない場合やgradeが取得できない場合のデフォルト値を設定
                const grade = currentClass?.grade ?? 1; // デフォルトを1に設定

                const [rawRes, commentRes, gradeSummaryRes] = await Promise.all([
                    fetch(`${apiBaseUrl}/grades/raw_data?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/comments?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/grade_summary?academic_year=${academic_year}&grade=${grade}`) // gradeを渡す
                ]);

                if (!rawRes.ok) {
                    const errorText = await rawRes.text();
                    console.error("Failed to fetch raw data:", rawRes.status, errorText);
                    throw new Error(`回答データの取得に失敗しました (Status: ${rawRes.status})`);
                 }
                setRawData(await rawRes.json());

                // コメントとサマリーは失敗してもエラーにしない（データがない場合もあるため）
                if (commentRes.ok) {
                    const commentData = await commentRes.json();
                    setComments(commentData.comments || []);
                } else {
                    console.warn("Failed to fetch comments:", commentRes.status);
                    setComments([]);
                }

                if (gradeSummaryRes.ok) {
                    const summaryData = await gradeSummaryRes.json();
                    setGradeSummary(summaryData.summary || []);
                } else {
                    console.warn("Failed to fetch grade summary:", gradeSummaryRes.status);
                     // 学年データがない場合は空にする
                    setGradeSummary([]);
                }

            } catch (error) {
                console.error("fetchGradesData error:", error);
                setError(error instanceof Error ? error.message : String(error));
                 // エラー発生時はデータを空にする
                setRawData([]);
                setComments([]);
                setGradeSummary([]);
            } finally {
                setLoading(false);
            }
        };
        fetchGradesData();
    // classes, selectedClassId, selectedAcademicYear も依存配列に追加
    }, [selectedLessonId, apiBaseUrl, classes, selectedClassId, selectedAcademicYear]);

    // useMemo フックは変更なし
    const statistics = useMemo(() => {
        if (rawData.length === 0) return null;

        let totalCorrect = 0;
        let totalAnswers = 0;
        const questionStats: { [label: string]: QuestionStats } = {};

        rawData.forEach(item => {
            const label = item.question.question_label;
            if (!questionStats[label]) {
                questionStats[label] = {
                    question_id: item.question.question_id,
                    question_label: item.question.question_label,
                    part_name: item.question.part_name,
                    chapter_name: item.question.chapter_name,
                    unit_name: item.question.unit_name,
                    lesson_theme_name: item.question.lesson_theme_name,
                    lesson_theme_contents_id: item.question.lesson_theme_contents_id, // ★ 追加
                    correct: 0, total: 0,
                    choiceDistribution: { A: 0, B: 0, C: 0, D: 0 },
                    correctChoice: item.question.correct_choice,
                    correctTimes: [], incorrectTimes: []
                };
            }
            if (item.answer.selected_choice) {
                totalAnswers++;
                questionStats[label].total++;
                // 選択肢が存在しない場合（例：'E'など）を考慮
                if (questionStats[label].choiceDistribution.hasOwnProperty(item.answer.selected_choice)) {
                    questionStats[label].choiceDistribution[item.answer.selected_choice]++;
                }
                const answerTime = item.answer.end_unix && item.answer.start_unix ? item.answer.end_unix - item.answer.start_unix : 0;
                // is_correctがnullでないことを確認
                if (item.answer.is_correct === true) {
                    totalCorrect++;
                    questionStats[label].correct++;
                    if (answerTime > 0) questionStats[label].correctTimes.push(answerTime);
                } else if (item.answer.is_correct === false) { // falseの場合のみ不正解時間に加算
                    if (answerTime > 0) questionStats[label].incorrectTimes.push(answerTime);
                }
            }
        });

        const classAverage = totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;

        let bestQuestion = "N/A", worstQuestion = "N/A";
        let bestRate = -1, worstRate = 101;

        const questionStatsArray = Object.values(questionStats);
        questionStatsArray.sort((a, b) => (a.lesson_theme_contents_id || 0) - (b.lesson_theme_contents_id || 0));

        const tempGroupedStats = questionStatsArray.reduce((acc, stats) => {
            const unitName = stats.unit_name || 'その他';
            if (!acc[unitName]) {
                acc[unitName] = [];
            }
            acc[unitName].push(stats);
            return acc;
        }, {} as { [unitName: string]: QuestionStats[] });

        Object.values(tempGroupedStats).forEach(statsList => {
            statsList.forEach((stats, index) => {
                const rate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;

                const fullLabel = [stats.part_name, stats.chapter_name, stats.unit_name, stats.lesson_theme_name]
                    .filter(Boolean) // null や空文字列を除外
                    .join(" / ");

                if (stats.total > 0) { // 回答がある問題のみ比較対象とする
                    if (rate > bestRate) {
                        bestRate = rate;
                        bestQuestion = `${fullLabel || stats.question_label} 問${index + 1}`;
                    }
                    if (rate < worstRate) {
                        worstRate = rate;
                        worstQuestion = `${fullLabel || stats.question_label} 問${index + 1}`;
                    }
                }
            });
        });

        let gradeAverage = -1; // デフォルト値を -1 に変更
        if (gradeSummary && gradeSummary.length > 0) {
            // gradeSummaryから今回の授業で出題された問題のみを抽出
             const relevantSummaryItems = gradeSummary.filter(summaryItem =>
                Object.values(questionStats).some(stats => stats.question_id === summaryItem.question_id)
            );

            if (relevantSummaryItems.length > 0) {
                const totalGradeCorrect = relevantSummaryItems.reduce((acc, item) => acc + item.correct_answers, 0);
                const totalGradeAnswers = relevantSummaryItems.reduce((acc, item) => acc + item.total_answers, 0);
                if (totalGradeAnswers > 0) {
                    gradeAverage = (totalGradeCorrect / totalGradeAnswers) * 100;
                } else {
                     gradeAverage = 0; // 回答がない場合は0%
                }
            } else {
                 gradeAverage = -1; // 該当する問題の学年データがない場合は -1
            }
        }

        return { classAverage, questionStats, bestQuestion, worstQuestion, gradeAverage };
    }, [rawData, gradeSummary, selectedLessonId]); // selectedLessonIdを追加して授業が変わった時に再計算

    // keywordAnalysis フックは変更なし
    const keywordAnalysis = useMemo(() => {
        const keywords: { [key: string]: number } = {};
        comments.forEach(c => {
            if (c.comment_text) {
                // 正規表現を改善して、より多くの単語を抽出（記号などを除外）
                c.comment_text.match(/[\p{L}\p{N}_]+/gu)?.forEach(word => {
                     // 1文字の単語（特にひらがな・カタカナ）も意味を持つ可能性があるので含める
                     // 必要であればストップワードリストで除外する
                    keywords[word] = (keywords[word] || 0) + 1;
                });
            }
        });
        // 出現頻度でソートし、上位5件を取得
        return Object.entries(keywords)
                     .sort((a, b) => b[1] - a[1])
                     .slice(0, 5);
    }, [comments]);

    const groupedStats = useMemo(() => {
        if (!statistics) return {};
        const questionStatsArray = Object.values(statistics.questionStats);
        // Sort by lesson_theme_contents_id to ensure consistent ordering
        questionStatsArray.sort((a, b) => (a.lesson_theme_contents_id || 0) - (b.lesson_theme_contents_id || 0));

        return questionStatsArray.reduce((acc, stats) => {
            const unitName = stats.unit_name || 'その他';
            if (!acc[unitName]) {
                acc[unitName] = [];
            }
            acc[unitName].push(stats);
            return acc;
        }, {} as { [unitName: string]: QuestionStats[] });
    }, [statistics]);

    const unitMaxTimes = useMemo(() => {
        const maxTimes: { [unitName: string]: number } = {};
        Object.entries(groupedStats).forEach(([unitName, statsList]: [string, QuestionStats[]]) => {
            const allTimes = statsList.flatMap(stats => [...stats.correctTimes, ...stats.incorrectTimes]);
            const maxObservedTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
            maxTimes[unitName] = Math.max(30, Math.ceil(maxObservedTime / 10) * 10);
        });
        return maxTimes;
    }, [groupedStats]);


    const selectedLesson = lessons.find(l => l.lesson_id === parseInt(selectedLessonId));
    const selectedClass = classes.find(c => c.class_id === parseInt(selectedClassId));
    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
             // dateがInvalid Dateでないかチェック
            if (isNaN(date.getTime())) {
                return "無効な日付";
            }
            const days = ['日', '月', '火', '水', '木', '金', '土'];
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${days[date.getDay()]}）`;
        } catch (e) {
            console.error("Date formatting error:", e);
            return "日付エラー";
        }
    };

    // JSX部分は変更なし
    return (
        <div className="p-4 sm:p-6 md:p-8 bg-[#f4f7f9] min-h-screen">
             <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                 <div className="flex items-center gap-2">
                     <button onClick={() => router.push("/")} className="text-gray-600 hover:text-gray-900">&lt; 戻る</button>
                 </div>
                 <div className="flex flex-wrap items-center gap-4">
                     <select
                         value={selectedAcademicYear}
                         onChange={(e) => setSelectedAcademicYear(parseInt(e.target.value, 10))}
                         className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                     >
                         {availableYears.map(year => <option key={year} value={year}>{year}年度</option>)}
                     </select>
                     <select
                         value={selectedClassId}
                         onChange={(e) => {
                             setSelectedClassId(e.target.value);
                             setSelectedLessonId(""); // クラス変更時に授業選択をリセット
                             setRawData([]);       // データもリセット
                             setComments([]);
                             setGradeSummary([]);
                             setError(null);      // エラーもリセット
                         }}
                         className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                     >
                         <option value="" disabled>クラスを選択</option>
                         {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
                     </select>
                     <select
                         value={selectedLessonId}
                         onChange={(e) => setSelectedLessonId(e.target.value)}
                         disabled={!selectedClassId || lessons.length === 0}
                         className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100"
                     >
                         <option value="">授業を選択</option>
                         {lessons.length === 0 && selectedClassId && <option disabled>授業データなし</option>}
                         {lessons.map(l => <option key={l.lesson_id} value={l.lesson_id}>
                             {formatDate(l.date)} {l.period}限 {l.lesson_name}
                         </option>)}
                     </select>
                 </div>
             </div>

            {/* loadingとerrorの表示は変更なし */}
            {loading && <div className="text-center py-10 text-gray-500">分析データを読み込み中...</div>}
            {!loading && error && <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-lg">{error}</div>}
             {/* データがない場合の表示を追加 */}
            {!loading && !error && !selectedLessonId && (
                <div className="text-center py-10 text-gray-500">クラスと授業を選択してください。</div>
            )}
            {!loading && !error && selectedLessonId && !statistics && (
                 <div className="text-center py-10 text-gray-500">選択された授業の分析データが見つかりませんでした。</div>
            )}


            {!loading && !error && statistics && (
                <main className="space-y-8">
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                        <h1 className="text-2xl font-bold text-gray-800">
                             {/* selectedClassとselectedLessonが存在するか確認 */}
                            {selectedAcademicYear}年度 {selectedClass?.class_name || 'クラス情報なし'} {selectedLesson?.lesson_name || '授業情報なし'} 学習結果分析
                        </h1>
                        <p className="text-gray-500">
                            {selectedLesson ? `${formatDate(selectedLesson.date)} ${selectedLesson.period}限` : '日付情報なし'}
                        </p>
                    </div>

                    <section className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 pb-2 mb-6 border-b-2 border-gray-200">全体サマリー分析</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            <SummaryCard title="クラス平均正答率" value={`${Math.round(statistics.classAverage)}%`} color="blue" description="この授業における全問題の正答率の平均値です。" />
                            <SummaryCard
                                title="学年平均正答率"
                                value={statistics.gradeAverage >= 0 ? `${Math.round(statistics.gradeAverage)}%` : "データなし"}
                                color="gray"
                                description="この授業で出題された問題における、同学年の総正解数÷総回答数で算出した平均値です。"
                            />
                            <SummaryCard title="クラス正答率が高い問題" value={statistics.bestQuestion} color="emerald" description="この授業で最もクラスの正答率が高かった問題（単元・テーマ）です。" isProblemCard={true} />
                            <SummaryCard title="クラス正答率が低い問題" value={statistics.worstQuestion} color="amber" description="この授業で最もクラスの正答率が低かった問題（単元・テーマ）です。" isProblemCard={true} />
                        </div>
                    </section>

                    <section className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 pb-2 mb-6 border-b-2 border-gray-200">設問別 詳細分析</h2>
                         {/* 問題が存在しない場合の表示 */}
                        {Object.keys(statistics.questionStats).length === 0 ? (
                            <p className="text-gray-500 text-center">この授業には分析対象の問題データがありません。</p>
                        ) : (
                            <div className="space-y-8">
                                {Object.entries(groupedStats).map(([unitName, statsList]) => (
                                    <div key={unitName}>
                                        <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">{unitName}</h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-8">
                                            {statsList.map((stats, index) => {
                                                const gradeAvgItem = gradeSummary?.find(item => item.question_id === stats.question_id);
                                                const gradeAvgRate = gradeAvgItem?.correct_rate;
                                                const unitMaxTime = unitMaxTimes[unitName];
                                                return <QuestionDetailCard key={stats.question_label} label={stats.question_label} stats={stats} gradeAvg={gradeAvgRate} questionNumber={index + 1} maxTime={unitMaxTime} />;
                                            })}                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                     <section className="bg-white p-6 rounded-xl shadow-sm">
                         <h2 className="text-xl font-bold text-gray-800 pb-2 mb-6 border-b-2 border-gray-200">定性（アンケート）分析</h2>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <KeywordMap keywords={keywordAnalysis} />
                             <CommentsList comments={comments} />
                         </div>
                     </section>
                </main>
            )}
        </div>
    );
}


// SummaryCard コンポーネントは変更なし
const SummaryCard = ({ title, value, color, description, isProblemCard }: { title: string, value: string, color: string, description: string, isProblemCard?: boolean }) => {
    const colors = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', value: 'text-blue-800' },
        gray: { bg: 'bg-gray-50', text: 'text-gray-600', value: 'text-gray-700' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', value: 'text-emerald-800' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-700', value: 'text-amber-800' }
    };
    const c = colors[color as keyof typeof colors] || colors.gray;

     // isProblemCardがtrueで、valueが長い場合にフォントサイズを調整
    const valueStyle = isProblemCard && value.length > 20 ? 'text-sm' : 'text-lg';

    return (
        // title属性でツールチップ表示
        <div className={`${c.bg} p-4 rounded-lg flex flex-col justify-center min-h-[140px] shadow-sm`} title={description}>
            <p className={`${c.text} text-sm font-semibold mb-2 text-center`}>{title}</p>
             {/* valueが "N/A" の場合は中央揃え */}
            <p className={`${c.value} ${valueStyle} font-bold break-words px-2 ${value === 'N/A' || !isProblemCard ? 'text-center' : 'text-left'}`}>
                {value}
            </p>
        </div>
    );
};

const QuestionDetailCard = ({ label, stats, gradeAvg, questionNumber, maxTime }: { label: string, stats: QuestionStats, gradeAvg?: number | null, questionNumber?: number, maxTime: number }) => { // gradeAvgをnull許容に
    const correctRate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    const rateColor = correctRate >= 80 ? 'green' : correctRate >= 50 ? 'orange' : 'red';
    const rateClasses = {
        green: 'font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded',
        orange: 'font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded',
        red: 'font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded',
    };
    // fullQuestionLabel の生成ロジックは変更なし
     const fullQuestionLabel = [stats.part_name, stats.chapter_name, stats.unit_name, stats.lesson_theme_name]
        .filter(Boolean) // null や空文字列を除外
        .map(s => s?.trim()) // 各部分の前後の空白を削除
        .filter(s => s && s.length > 0) // 空白のみの文字列も除外
        .join("/");


    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-4 flex flex-col bg-white shadow-sm">
            <div>
                 {/* title属性に元のラベルを表示 */}
                <div className="flex flex-wrap justify-between items-baseline gap-2" title={`元のラベル: ${label}`}>
                    <h3 className="font-bold text-base text-gray-800">
                        {fullQuestionLabel || label}
                        {questionNumber && <span className="font-bold text-base text-gray-800 ml-2">問{questionNumber}</span>}
                    </h3>
                    <div className="flex items-baseline gap-2 text-xs flex-shrink-0">
                        <span className={rateClasses[rateColor]}>クラス: {Math.round(correctRate)}%</span>
                        {/* gradeAvgがnullまたはundefinedでない場合のみ表示 */}
                        <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                           学年: {gradeAvg != null ? `${Math.round(gradeAvg)}%` : "データなし"}
                        </span>
                    </div>
                </div>
            </div>
            <div>
                <p className="font-semibold text-xs text-gray-600 mb-2">回答選択率</p>
                <div className="space-y-1 text-xs">
                    {['A', 'B', 'C', 'D'].map(choice => {
                        const isCorrect = choice === stats.correctChoice;
                        // stats.totalが0の場合のゼロ除算を防ぐ
                        const percentage = stats.total > 0 ? ((stats.choiceDistribution[choice] || 0) / stats.total) * 100 : 0;
                        return (
                            <div key={choice} className="flex items-center gap-2">
                                <span className={`w-6 text-center ${isCorrect ? 'font-bold text-green-600' : 'text-gray-700'}`}>{choice}</span>
                                <div className={`flex-grow ${isCorrect ? 'bg-green-100' : 'bg-gray-100'} rounded-full h-3 relative overflow-hidden`}>
                                     {/* バー */}
                                    <div className={`${isCorrect ? 'bg-green-400' : 'bg-gray-400'} h-full rounded-full absolute top-0 left-0`} style={{ width: `${percentage}%` }}></div>
                                    {/* バーの上にテキスト表示 */}
                                    <span className={`absolute top-0 left-1/2 transform -translate-x-1/2 text-[10px] leading-3 ${percentage > 50 ? 'text-white' : 'text-gray-700'}`}>
                                        {Math.round(percentage)}%
                                    </span>
                                </div>
                                <span className={`w-10 text-right ${isCorrect ? 'text-green-600 font-bold' : 'text-transparent'}`}>{isCorrect ? '(正解)' : ''}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <AnswerTimeDistribution stats={stats} maxTime={maxTime} />
        </div>
    );
};


// AnswerTimeDistribution, DotPlot, KeywordMap, CommentsList コンポーネントは変更なし
const AnswerTimeDistribution = ({ stats, maxTime }: { stats: QuestionStats, maxTime: number }) => {
    // ゼロ除算を避ける
    const avgCorrect = stats.correctTimes.length > 0 ? Math.round(stats.correctTimes.reduce((a, b) => a + b, 0) / stats.correctTimes.length) : null;
    const avgIncorrect = stats.incorrectTimes.length > 0 ? Math.round(stats.incorrectTimes.reduce((a, b) => a + b, 0) / stats.incorrectTimes.length) : null;

    // 平均時間が計算できた場合のみタイトルに追加
    const correctTitle = `正解者` + (avgCorrect !== null ? ` (平均: ${avgCorrect}秒)` : '');
    const incorrectTitle = `不正解者` + (avgIncorrect !== null ? ` (平均: ${avgIncorrect}秒)` : '');


    return (
        <div className="flex-grow flex flex-col mt-2"> {/* 上部のマージンを少し追加 */}
            <div className="flex justify-between items-center mb-1"> {/* 下部のマージンを少し削減 */}
                <p className="font-semibold text-xs text-gray-600">回答時間 分布</p>
                <div className="flex items-center gap-3 text-[10px] text-gray-500"> {/* gapを少し調整 */}
                     {/* 平均アイコンとテキスト */}
                    {(avgCorrect !== null || avgIncorrect !== null) && ( // 平均がある場合のみ表示
                        <div className="flex items-center gap-1">
                             {/* 星アイコン */}
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                            <span>平均</span>
                        </div>
                    )}
                     {/* 凡例 */}
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                        <span>正解</span>
                    </div>
                     <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                        <span>不正解</span>
                    </div>
                </div>
            </div>
            <div className="space-y-3 text-xs flex-grow"> {/* space-yを調整 */}
                 {/* 正解者のドットプロット */}
                <DotPlot title={correctTitle} times={stats.correctTimes} color="green" avgTime={avgCorrect} maxTime={maxTime} />
                 {/* 不正解者のドットプロット */}
                <DotPlot title={incorrectTitle} times={stats.incorrectTimes} color="gray" avgTime={avgIncorrect} maxTime={maxTime} />
            </div>
        </div>
    );
};
const DotPlot = ({ title, times, color, avgTime, maxTime }: { title: string, times: number[], color: 'green' | 'gray', avgTime: number | null, maxTime: number }) => {
    const timeCounts: { [time: number]: number } = {};
    times.forEach(t => {
         // 10秒ごとに丸める
        const timeKey = Math.min(maxTime, Math.max(0, Math.round(t / 10) * 10)); // 0秒未満、maxTime秒超を丸める
        timeCounts[timeKey] = (timeCounts[timeKey] || 0) + 1;
    });

    return (
        <div className="flex-grow">
            <span className={`font-medium text-[10px] ${color === 'green' ? 'text-green-700' : 'text-gray-700'}`}>{title}</span>
            <div className="relative h-14 mt-1"> {/* dot-plot-container */}
                {/* ドット表示エリア */}
                <div className="absolute bottom-4 left-0 right-0 h-8"> {/* dot-container */}
                    {Object.entries(timeCounts).map(([timeStr, count]) => {
                        const time = Number(timeStr);
                         // 最大値を超えないように位置を計算
                        const position = maxTime > 0 ? Math.min(100, Math.max(0, (time / maxTime) * 100)) : 0;
                        return Array.from({ length: Math.min(count, 5) }).map((_, i) => ( // 最大5段まで表示
                             <span
                                key={`${time}-${i}`}
                                className={`absolute bottom-0 w-1.5 h-1.5 rounded-full transform -translate-x-1/2 ${color === 'green' ? 'bg-green-400' : 'bg-gray-400'} dot dot-stack-${i + 1}`}
                                style={{ left: `${position}%`, bottom: `${i * 7}px` }} // 積み重ねの間隔を調整
                                title={`${time}秒 (${count}人)`} // ツールチップに人数も表示
                            ></span>
                        ));
                    })}
                </div>
                {/* X軸エリア */}
                <div className="absolute bottom-0 left-0 right-0 h-4"> {/* axis-container */}
                     {/* X軸線 */}
                    <div className="absolute bottom-2 left-0 right-0 h-px bg-gray-300"></div> {/* axis-line */}
                     {/* X軸ラベル */}
                    <span className="absolute bottom-[-4px] text-[9px] text-gray-500 transform -translate-x-1/2" style={{ left: '0%' }}>0s</span> {/* axis-label */}
                    <span className="absolute bottom-[-4px] text-[9px] text-gray-500 transform -translate-x-1/2" style={{ left: '50%' }}>{Math.round(maxTime / 2)}s</span> {/* axis-label */}
                    <span className="absolute bottom-[-4px] text-[9px] text-gray-500 transform -translate-x-1/2" style={{ left: '100%' }}>{maxTime}s</span> {/* axis-label */}
                    {/* 平均マーカー */}
                     {avgTime !== null && times.length > 0 && ( // avgTimeがnullでない場合のみ表示
                        <div className="absolute bottom-2 w-3 h-3 transform -translate-x-1/2 translate-y-1/2" style={{ left: `${maxTime > 0 ? Math.min(100, Math.max(0, (avgTime / maxTime) * 100)) : 0}%` }} title={`平均: ${avgTime}秒`}> {/* avg-marker */}
                            <svg className={`w-full h-full ${color === 'green' ? 'text-green-600' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                            </svg>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
const KeywordMap = ({ keywords }: { keywords: [string, number][] }) => {
    // keywordsが空、または有効なキーワードがない場合は早期リターン
    if (!keywords || keywords.length === 0 || keywords.every(([word, count]) => count <= 0)) {
        return (
            <div>
                <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">キーワードマップ</h3>
                <div className="flex items-center justify-center p-4 border bg-gray-50 rounded-lg min-h-[180px] text-gray-500 text-xs">
                    コメントからキーワードは抽出されませんでした。
                </div>
            </div>
        );
    }

    // 最大カウントが0にならないように調整
    const maxCount = Math.max(1, ...keywords.map(k => k[1]));
    // 最小カウントも考慮してスケールを調整（対数スケールが適切か線形スケールが良いか検討）
    // const minCount = Math.max(1, Math.min(...keywords.map(k => k[1]))); // あまり使わないかも

    const getStyle = (count: number) => {
        const baseSize = 0.7; // rem 単位
        const maxSize = 1.8; // rem 単位
        // カウントの対数に基づいてサイズを決定（差が大きすぎる場合に対数スケールが有効）
        // 線形スケールの方が直感的な場合もある: const factor = (count - minCount) / (maxCount - minCount || 1);
        const factor = Math.log(count + 1) / Math.log(maxCount + 1); // 1を加えることでlog(1)=0を避ける
        const size = baseSize + (maxSize - baseSize) * factor;

        // 不透明度もカウントに基づいて調整
        const minOpacity = 0.5;
        const maxOpacity = 1.0;
        const opacityFactor = count / maxCount;
        const opacity = minOpacity + (maxOpacity - minOpacity) * opacityFactor;

        return {
            fontSize: `${size}rem`,
            lineHeight: 1.2, // 少し行間を空ける
            opacity: opacity,
            margin: '0.2rem 0.4rem', // 少しマージンを追加
            display: 'inline-block', // マージンを有効にする
            };
    };
    return (
        <div>
            <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">キーワードマップ</h3>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 p-4 border bg-gray-50 rounded-lg min-h-[180px]">
                {keywords.map(([word, count]) => (
                    // 頻度をツールチップで表示
                    <span key={word} className="text-sky-800 font-medium" style={getStyle(count)} title={`出現回数: ${count}`}>
                        {word}
                    </span>
                ))}
            </div>
        </div>
    );
};

const CommentsList = ({ comments }: { comments: CommentData[] }) => {
     // コメントテキストが存在するコメントのみをフィルタリング
    const validComments = comments.filter(c => c.comment_text && c.comment_text.trim().length > 0);

    return (
        <div>
            <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">主なコメント（上位3件）</h3>
            <div className="space-y-2">
                {validComments.length > 0 ? (
                    validComments.slice(0, 3).map((c, i) => (
                        <div key={c.student_id + '-' + i} className="bg-gray-100 p-3 rounded-lg text-xs text-gray-800 shadow-sm">
                             {/* 誰のコメントか分かるように名前も表示（オプション）*/}
                            {/* <span className="font-semibold mr-2">{c.student_name}:</span> */}
                            「{c.comment_text}」
                        </div>
                    ))
                ) : (
                    <div className="text-gray-500 text-xs text-center bg-gray-50 rounded-lg p-4 min-h-[180px] flex items-center justify-center border">
                        有効なコメントはありませんでした。
                    </div>
                )}
            </div>
        </div>
    );
};
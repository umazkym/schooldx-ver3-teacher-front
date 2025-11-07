// src/app/grades/page.tsx
"use client"
import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { apiBaseUrl } from '@/lib/apiConfig';

// --- 型定義 (変更なし) ---
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
    student: { student_id: number; name: string; class_id: number; students_number: number; };
    question: {
        question_id: number;
        question_label: string;
        correct_choice: string;
        part_name: string | null;
        chapter_name: string | null;
        unit_name: string | null;
        lesson_theme_name: string | null;
        lesson_theme_contents_id: number | null;
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

type LessonSurveySummary = {
    understanding_level_distribution: { [key: string]: number };
    difficulty_point_distribution: { [key: string]: number };
};

type QuestionStats = {
    question_id: number;
    question_label: string;
    part_name: string | null;
    chapter_name: string | null;
    unit_name: string | null;
    lesson_theme_name: string | null;
    lesson_theme_contents_id: number | null;
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

    // --- State管理 (変更なし) ---
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>("");
    const [lessons, setLessons] = useState<LessonData[]>([]);
    const [selectedLessonId, setSelectedLessonId] = useState<string>("");
    const [rawData, setRawData] = useState<RawDataItem[]>([]);
    const [comments, setComments] = useState<CommentData[]>([]);
    const [gradeSummary, setGradeSummary] = useState<GradeSummaryItem[]>([]);
    const [surveySummary, setSurveySummary] = useState<LessonSurveySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedAcademicYear, setSelectedAcademicYear] = useState<number>(getCurrentAcademicYear);
    const [availableYears, setAvailableYears] = useState<number[]>([]);

    useEffect(() => {
        const currentYear = getCurrentAcademicYear();
        const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
        setAvailableYears(years);
    }, []);

    // --- APIデータ取得 (変更なし) ---
    useEffect(() => {
        if (!apiBaseUrl) return;
        const fetchClasses = async () => {
            setError(null);
            try {
                const res = await fetch(`${apiBaseUrl}/classes/`);
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error("Failed to fetch classes:", res.status, errorText);
                    throw new Error(`クラス一覧の取得に失敗しました (Status: ${res.status})`);
                }
                const data = await res.json();
                setClasses(data);
                if (data.length > 0 && !selectedClassId) {
                    setSelectedClassId(String(data[0].class_id));
                }
            } catch (error) {
                console.error("fetchClasses error:", error);
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchClasses();
    }, [apiBaseUrl]);

    useEffect(() => {
        if (!selectedClassId || !apiBaseUrl || !selectedAcademicYear) {
            setLessons([]);
            setSelectedLessonId("");
            return;
        }
        const fetchLessons = async () => {
            setError(null);
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

                setSelectedLessonId("");
            } catch (error) {
                console.error("fetchLessons error:", error);
                setLessons([]);
                setSelectedLessonId("");
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchLessons();
    }, [selectedClassId, selectedAcademicYear, apiBaseUrl]);

    useEffect(() => {
        if (!selectedLessonId || !apiBaseUrl) {
            setRawData([]);
            setComments([]);
            setGradeSummary([]);
            setSurveySummary(null);
            return;
        };
        const fetchGradesData = async () => {
            setLoading(true);
            setError(null);
            try {
                const currentClass = classes.find(c => c.class_id === parseInt(selectedClassId));
                const academic_year = selectedAcademicYear;
                const grade = currentClass?.grade ?? 1;

                const [rawRes, commentRes, gradeSummaryRes, surveySummaryRes] = await Promise.all([
                    fetch(`${apiBaseUrl}/grades/raw_data?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/comments?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/grade_summary?academic_year=${academic_year}&grade=${grade}`),
                    fetch(`${apiBaseUrl}/lesson_surveys/lesson/${selectedLessonId}/summary`)
                ]);

                if (!rawRes.ok) {
                    const errorText = await rawRes.text();
                    console.error("Failed to fetch raw data:", rawRes.status, errorText);
                    throw new Error(`回答データの取得に失敗しました (Status: ${rawRes.status})`);
                 }
                setRawData(await rawRes.json());

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
                    setGradeSummary([]);
                }

                if (surveySummaryRes.ok) {
                    const surveyData = await surveySummaryRes.json();
                    setSurveySummary(surveyData);
                } else {
                    console.warn("Failed to fetch survey summary:", surveySummaryRes.status);
                    setSurveySummary(null);
                }

            } catch (error) {
                console.error("fetchGradesData error:", error);
                setError(error instanceof Error ? error.message : String(error));
                setRawData([]);
                setComments([]);
                setGradeSummary([]);
                setSurveySummary(null);
            } finally {
                setLoading(false);
            }
        };
        fetchGradesData();
    }, [selectedLessonId, apiBaseUrl, classes, selectedClassId, selectedAcademicYear]);

    // --- statistics (useMemo) (変更なし) ---
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
                    lesson_theme_contents_id: item.question.lesson_theme_contents_id,
                    correct: 0, total: 0,
                    choiceDistribution: { A: 0, B: 0, C: 0, D: 0 },
                    correctChoice: item.question.correct_choice,
                    correctTimes: [], incorrectTimes: []
                };
            }
            if (item.answer.selected_choice) {
                totalAnswers++;
                questionStats[label].total++;
                if (questionStats[label].choiceDistribution.hasOwnProperty(item.answer.selected_choice)) {
                    questionStats[label].choiceDistribution[item.answer.selected_choice]++;
                }
                const answerTime = item.answer.end_unix && item.answer.start_unix ? item.answer.end_unix - item.answer.start_unix : 0;
                if (item.answer.is_correct === true) {
                    totalCorrect++;
                    questionStats[label].correct++;
                    if (answerTime > 0) questionStats[label].correctTimes.push(answerTime);
                } else if (item.answer.is_correct === false) {
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
                const simpleLabel = stats.lesson_theme_name || stats.unit_name || stats.question_label;

                if (stats.total > 0) {
                    if (rate > bestRate) {
                        bestRate = rate;
                        bestQuestion = `${simpleLabel} 問${index + 1}`;
                    }
                    if (rate < worstRate) {
                        worstRate = rate;
                        worstQuestion = `${simpleLabel} 問${index + 1}`;
                    }
                }
            });
        });

        let gradeAverage = -1;
        if (gradeSummary && gradeSummary.length > 0) {
             const relevantSummaryItems = gradeSummary.filter(summaryItem =>
                Object.values(questionStats).some(stats => stats.question_id === summaryItem.question_id)
            );

            if (relevantSummaryItems.length > 0) {
                const totalGradeCorrect = relevantSummaryItems.reduce((acc, item) => acc + item.correct_answers, 0);
                const totalGradeAnswers = relevantSummaryItems.reduce((acc, item) => acc + item.total_answers, 0);
                if (totalGradeAnswers > 0) {
                    gradeAverage = (totalGradeCorrect / totalGradeAnswers) * 100;
                } else {
                     gradeAverage = 0;
                }
            } else {
                 gradeAverage = -1;
            }
        }

        return { classAverage, questionStats, bestQuestion, worstQuestion, gradeAverage };
    }, [rawData, gradeSummary, selectedLessonId]);

    // --- keywordAnalysis (useMemo) (変更なし) ---
    const keywordAnalysis = useMemo(() => {
        const keywords: { [key: string]: number } = {};
        comments.forEach(c => {
            if (c.comment_text) {
                c.comment_text.match(/[\p{L}\p{N}_]+/gu)?.forEach(word => {
                    keywords[word] = (keywords[word] || 0) + 1;
                });
            }
        });
        return Object.entries(keywords)
                     .sort((a, b) => b[1] - a[1])
                     .slice(0, 5);
    }, [comments]);

    // --- groupedStats (useMemo) (変更なし) ---
    const groupedStats = useMemo(() => {
        if (!statistics) return {};
        const questionStatsArray = Object.values(statistics.questionStats);
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

    // --- unitMaxTimes (useMemo) (変更なし) ---
    const unitMaxTimes = useMemo(() => {
        const maxTimes: { [unitName: string]: number } = {};
        Object.entries(groupedStats).forEach(([unitName, statsList]: [string, QuestionStats[]]) => {
            const allTimes = statsList.flatMap(stats => [...stats.correctTimes, ...stats.incorrectTimes]);
            const maxObservedTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
            maxTimes[unitName] = Math.max(30, Math.ceil(maxObservedTime / 10) * 10);
        });
        return maxTimes;
    }, [groupedStats]);

    // --- ヘルパー関数・変数 (変更なし) ---
    const selectedLesson = lessons.find(l => l.lesson_id === parseInt(selectedLessonId));
    const selectedClass = classes.find(c => c.class_id === parseInt(selectedClassId));
    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
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

    // --- JSX (メインコンポーネント) (変更なし) ---
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
                             setSelectedLessonId("");
                             setRawData([]);
                             setComments([]);
                             setGradeSummary([]);
                             setError(null);
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

            {loading && <div className="text-center py-10 text-gray-500">分析データを読み込み中...</div>}
            {!loading && error && <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-lg">{error}</div>}
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
                             <SurveySummaryChart summary={surveySummary} />
                             <div className="space-y-8">
                                 <KeywordMap keywords={keywordAnalysis} />
                                 <CommentsList comments={comments} />
                             </div>
                         </div>
                     </section>
                </main>
            )}
        </div>
    );
}


// --- SummaryCard (変更なし) ---
const SummaryCard = ({ title, value, color, description, isProblemCard }: { title: string, value: string, color: string, description: string, isProblemCard?: boolean }) => {
    const colors = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', value: 'text-blue-800' },
        gray: { bg: 'bg-gray-50', text: 'text-gray-600', value: 'text-gray-700' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', value: 'text-emerald-800' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-700', value: 'text-amber-800' }
    };
    const c = colors[color as keyof typeof colors] || colors.gray;
    const valueStyle = isProblemCard && value.length > 15 ? 'text-base' : 'text-lg';

    return (
        <div className={`${c.bg} p-4 rounded-lg flex flex-col justify-center min-h-[140px] shadow-sm`} title={description}>
            <p className={`${c.text} text-sm font-semibold mb-2 text-center`}>{title}</p>
            <p className={`${c.value} ${valueStyle} font-bold break-words px-2 text-center`}>
                {value}
            </p>
        </div>
    );
};

// --- QuestionDetailCard コンポーネント (★ 改善) ---
const QuestionDetailCard = ({ label, stats, gradeAvg, questionNumber, maxTime }: { label: string, stats: QuestionStats, gradeAvg?: number | null, questionNumber?: number, maxTime: number }) => {
    const correctRate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    const rateColor = correctRate >= 80 ? 'green' : correctRate >= 50 ? 'orange' : 'red';
    const rateClasses = {
        green: 'font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded',
        orange: 'font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded',
        red: 'font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded',
    };
    
    const fullQuestionLabel = [stats.unit_name, stats.lesson_theme_name]
        .filter(Boolean)
        .map(s => s?.trim())
        .filter(s => s && s.length > 0)
        .join(" / ");

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 flex flex-col bg-white shadow-sm">
            <div>
                <div className="flex flex-col gap-2" title={`元のラベル: ${label}`}>
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-base text-gray-800 break-words" title={fullQuestionLabel || label}>
                            {stats.lesson_theme_name || label}
                        </h3>
                        {questionNumber && <span className="font-bold text-base text-gray-800 ml-2 flex-shrink-0">問{questionNumber}</span>}
                    </div>
                    
                    {/* ▼▼▼ 修正: ラベルを「クラス正答率」「学年正答率」に変更 ▼▼▼ */}
                    <div className="flex items-baseline gap-2 text-xs flex-shrink-0 self-end">
                        <span className={rateClasses[rateColor]}>クラス正答率: {Math.round(correctRate)}%</span>
                        <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                           学年正答率: {gradeAvg != null ? `${Math.round(gradeAvg)}%` : "データなし"}
                        </span>
                    </div>
                    {/* ▲▲▲ 修正ここまで ▲▲▲ */}
                </div>
            </div>
            <div>
                <p className="font-semibold text-xs text-gray-600 mb-2">回答選択率</p>
                <div className="space-y-1 text-xs">
                    {['A', 'B', 'C', 'D'].map(choice => {
                        const isCorrect = choice === stats.correctChoice;
                        const percentage = stats.total > 0 ? ((stats.choiceDistribution[choice] || 0) / stats.total) * 100 : 0;
                        return (
                            <div key={choice} className="flex items-center gap-2">
                                <span className={`w-6 text-center ${isCorrect ? 'font-bold text-green-600' : 'text-gray-700'}`}>{choice}</span>
                                {/* ▼▼▼ 修正: 0%でもテキストが見えるように調整 ▼▼▼ */}
                                <div className={`flex-grow ${isCorrect ? 'bg-green-100' : 'bg-gray-100'} rounded-full h-3 relative overflow-hidden`}>
                                    {percentage > 0 && (
                                        <div className={`${isCorrect ? 'bg-green-400' : 'bg-gray-400'} h-full rounded-full absolute top-0 left-0`} style={{ width: `${percentage}%` }}></div>
                                    )}
                                    <span className={`absolute top-0 left-2 text-[10px] leading-3 font-medium ${percentage > 10 ? (isCorrect ? 'text-white' : 'text-gray-800') : (isCorrect ? 'text-green-700' : 'text-gray-700')}`}>
                                        {Math.round(percentage)}%
                                    </span>
                                </div>
                                {/* ▲▲▲ 修正ここまで ▲▲▲ */}
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


// --- AnswerTimeDistribution コンポーネント (★ 改善) ---
const AnswerTimeDistribution = ({ stats, maxTime }: { stats: QuestionStats, maxTime: number }) => {
    const avgCorrect = stats.correctTimes.length > 0 ? Math.round(stats.correctTimes.reduce((a, b) => a + b, 0) / stats.correctTimes.length) : null;
    const avgIncorrect = stats.incorrectTimes.length > 0 ? Math.round(stats.incorrectTimes.reduce((a, b) => a + b, 0) / stats.incorrectTimes.length) : null;

    const correctTitle = `正解者` + (avgCorrect !== null ? ` (平均: ${avgCorrect}秒)` : '');
    const incorrectTitle = `不正解者` + (avgIncorrect !== null ? ` (平均: ${avgIncorrect}秒)` : '');

    return (
        <div className="flex-grow flex flex-col mt-2">
            <div className="flex justify-between items-center mb-1">
                <p className="font-semibold text-xs text-gray-600">回答時間 分布</p>
                {/* ▼▼▼ 修正: 凡例の文字サイズを text-xs に統一 ▼▼▼ */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    {(avgCorrect !== null || avgIncorrect !== null) && (
                        <div className="flex items-center gap-1">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                            <span>平均</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                        <span>正解</span>
                    </div>
                     <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                        <span>不正解</span>
                    </div>
                </div>
                {/* ▲▲▲ 修正ここまで ▲▲▲ */}
            </div>
            <div className="space-y-3 text-xs flex-grow">
                <DotPlot title={correctTitle} times={stats.correctTimes} color="green" avgTime={avgCorrect} maxTime={maxTime} />
                <DotPlot title={incorrectTitle} times={stats.incorrectTimes} color="gray" avgTime={avgIncorrect} maxTime={maxTime} />
            </div>
        </div>
    );
};

// --- DotPlot コンポーネント (★ 改善) ---
const DotPlot = ({ title, times, color, avgTime, maxTime }: { title: string, times: number[], color: 'green' | 'gray', avgTime: number | null, maxTime: number }) => {
    const timeCounts: { [time: number]: number } = {};
    times.forEach(t => {
        const timeKey = Math.min(maxTime, Math.max(0, Math.round(t / 10) * 10));
        timeCounts[timeKey] = (timeCounts[timeKey] || 0) + 1;
    });

    return (
        <div className="flex-grow">
            <span className={`font-medium text-xs ${color === 'green' ? 'text-green-700' : 'text-gray-700'}`}>{title}</span>
            <div className="relative h-14 mt-1">
                <div className="absolute bottom-4 left-0 right-0 h-8">
                    {Object.entries(timeCounts).map(([timeStr, count]) => {
                        const time = Number(timeStr);
                        const position = maxTime > 0 ? Math.min(100, Math.max(0, (time / maxTime) * 100)) : 0;
                        return Array.from({ length: Math.min(count, 5) }).map((_, i) => (
                             // ▼▼▼ 修正: ドットのサイズと間隔を調整 ▼▼▼
                             <span
                                key={`${time}-${i}`}
                                className={`absolute bottom-0 w-2 h-2 rounded-full transform -translate-x-1/2 ${color === 'green' ? 'bg-green-400' : 'bg-gray-400'} dot dot-stack-${i + 1}`}
                                style={{ left: `${position}%`, bottom: `${i * 9}px` }} // 7px -> 9px
                                title={`${time}秒 (${count}人)`}
                            ></span>
                            // ▲▲▲ 修正ここまで ▲▲▲
                        ));
                    })}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-4">
                     {/* ▼▼▼ 修正: 軸線を濃く、ラベルを大きく ▼▼▼ */}
                    <div className="absolute bottom-2 left-0 right-0 h-px bg-gray-400"></div> {/* bg-gray-300 -> bg-gray-400 */}
                    <span className="absolute bottom-[-4px] text-xs text-gray-500 transform -translate-x-1/2" style={{ left: '0%' }}>0s</span> {/* text-[10px] -> text-xs */}
                    <span className="absolute bottom-[-4px] text-xs text-gray-500 transform -translate-x-1/2" style={{ left: '50%' }}>{Math.round(maxTime / 2)}s</span> {/* text-[10px] -> text-xs */}
                    <span className="absolute bottom-[-4px] text-xs text-gray-500 transform -translate-x-1/2" style={{ left: '100%' }}>{maxTime}s</span> {/* text-[10px] -> text-xs */}
                     {avgTime !== null && times.length > 0 && (
                        <div className="absolute bottom-2 w-3.5 h-3.5 transform -translate-x-1/2 translate-y-1/2" style={{ left: `${maxTime > 0 ? Math.min(100, Math.max(0, (avgTime / maxTime) * 100)) : 0}%` }} title={`平均: ${avgTime}秒`}> {/* w-3 h-3 -> w-3.5 h-3.5 */}
                            <svg className={`w-full h-full ${color === 'green' ? 'text-green-600' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                            </svg>
                        </div>
                    )}
                    {/* ▲▲▲ 修正ここまで ▲▲▲ */}
                </div>
            </div>
        </div>
    );
};

// --- SurveySummaryChart コンポーネント (★ 改善) ---
const SurveySummaryChart = ({ summary }: { summary: LessonSurveySummary | null }) => {
    if (!summary || (Object.keys(summary.understanding_level_distribution).length === 0 && Object.keys(summary.difficulty_point_distribution).length === 0)) {
        return (
            <div>
                <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">アンケート結果</h3>
                <div className="flex items-center justify-center p-4 border bg-gray-50 rounded-lg min-h-[180px] text-gray-500 text-xs">
                    アンケートデータがありません。
                </div>
            </div>
        );
    }

    const understandingLabels: { [key: string]: string } = {
        '5': 'よく理解できた',
        '4': '理解できた',
        '3': 'どちらともいえない',
        '2': 'あまり理解できなかった',
        '1': '全く理解できなかった',
    };

    const difficultyLabels: { [key: string]: string } = {
        '5': '非常に難しかった',
        '4': '難しかった',
        '3': '普通',
        '2': '簡単だった',
        '1': '非常に簡単だった',
    };

    const renderBarChart = (title: string, data: { [key: string]: number }, labels: { [key: string]: string }) => {
        const total = Object.values(data).reduce((acc, value) => acc + value, 0);
        if (total === 0) {
            return (
                <div>
                    <h4 className="font-semibold text-gray-600 mb-2 text-center text-xs">{title}</h4>
                    <div className="flex items-center justify-center p-4 border bg-gray-50 rounded-lg min-h-[120px] text-gray-500 text-xs">
                        データがありません。
                    </div>
                </div>
            );
        }

        return (
            <div>
                <h4 className="font-semibold text-gray-600 mb-2 text-center text-xs">{title}</h4>
                <div className="space-y-1 text-xs">
                    {Object.entries(labels)
                        .sort(([keyA], [keyB]) => parseInt(keyB) - parseInt(keyA))
                        .map(([key, label]) => {
                        const value = data[key] || 0;
                        const percentage = total > 0 ? (value / total) * 100 : 0;
                        return (
                            <div key={key} className="flex items-center gap-2">
                                <span className="w-32 text-right text-gray-700">{label}</span>
                                {/* ▼▼▼ 修正: 0%でもテキストが見えるように調整 ▼▼▼ */}
                                <div className="flex-grow bg-gray-200 rounded-full h-4 relative overflow-hidden">
                                    {percentage > 0 && (
                                        <div className="bg-sky-400 h-full rounded-full absolute top-0 left-0" style={{ width: `${percentage}%` }}></div>
                                    )}
                                    <span className={`absolute top-0 left-2 text-[10px] leading-4 font-medium ${percentage > 10 ? 'text-white' : 'text-gray-700'}`}>
                                        {Math.round(percentage)}% ({value})
                                    </span>
                                </div>
                                {/* ▲▲▲ 修正ここまで ▲▲▲ */}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {renderBarChart('授業の理解度', summary.understanding_level_distribution, understandingLabels)}
            {renderBarChart('授業の難易度', summary.difficulty_point_distribution, difficultyLabels)}
        </div>
    );
};

// --- KeywordMap (変更なし) ---
const KeywordMap = ({ keywords }: { keywords: [string, number][] }) => {
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

    const maxCount = Math.max(1, ...keywords.map(k => k[1]));

    const getStyle = (count: number) => {
        const baseSize = 0.8;
        const maxSize = 1.5;
        const factor = Math.log(count + 1) / Math.log(maxCount + 1);
        const size = baseSize + (maxSize - baseSize) * factor;

        const minOpacity = 0.5;
        const maxOpacity = 1.0;
        const opacityFactor = count / maxCount;
        const opacity = minOpacity + (maxOpacity - minOpacity) * opacityFactor;

        return {
            fontSize: `${size}rem`,
            lineHeight: 1.2,
            opacity: opacity,
            margin: '0.2rem 0.4rem',
            display: 'inline-block',
            };
    };
    return (
        <div>
            <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">キーワードマップ</h3>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 p-4 border bg-gray-50 rounded-lg min-h-[180px]">
                {keywords.map(([word, count]) => (
                    <span key={word} className="text-sky-800 font-medium" style={getStyle(count)} title={`出現回数: ${count}`}>
                        {word}
                    </span>
                ))}
            </div>
        </div>
    );
};

// --- CommentsList コンポーネント (★ 改善) ---
const CommentsList = ({ comments }: { comments: CommentData[] }) => {
    const validComments = comments.filter(c => c.comment_text && c.comment_text.trim().length > 0);

    return (
        <div>
            {/* ▼▼▼ 修正: タイトルを変更 ▼▼▼ */}
            <h3 className="font-semibold text-gray-700 mb-3 text-center text-sm">主なコメント</h3>
            {/* ▲▲▲ 修正ここまで ▲▲▲ */}
            <div className="space-y-2">
                {validComments.length > 0 ? (
                    validComments.slice(0, 3).map((c, i) => (
                        // ▼▼▼ 修正: コメントの文字サイズを大きく ▼▼▼
                        <div key={c.student_id + '-' + i} className="bg-gray-100 p-3 rounded-lg text-sm text-gray-800 shadow-sm"> {/* text-xs -> text-sm */}
                            「{c.comment_text}」
                        </div>
                        // ▲▲▲ 修正ここまで ▲▲▲
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
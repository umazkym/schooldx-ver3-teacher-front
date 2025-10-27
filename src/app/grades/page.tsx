"use client"
import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { apiBaseUrl } from '@/lib/apiConfig';

// --- 型定義 ---
type ClassData = { class_id: number; class_name: string; grade: number; };
type LessonData = { lesson_id: number; lesson_name: string; date: string; period: number; };

// ▼▼▼【修正】APIレスポンスの型を定義 ▼▼▼
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
// ▲▲▲【修正】ここまで ▲▲▲

type RawDataItem = {
    student: { student_id: number; name: string; class_id: number; };
    question: {
        question_id: number;
        question_label: string;
        correct_choice: string;
        part_name: string | null;
        chapter_name: string | null;
        unit_name: string | null;
        lesson_theme_name: string | null;
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
            try {
                const res = await fetch(`${apiBaseUrl}/classes`);
                if (!res.ok) throw new Error("クラス一覧の取得に失敗しました");
                const data = await res.json();
                setClasses(data);
                if (data.length > 0) {
                    setSelectedClassId(String(data[0].class_id));
                }
            } catch (error) {
                console.error(error);
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchClasses();
    }, []);

    useEffect(() => {
        if (!selectedClassId || !apiBaseUrl || !selectedAcademicYear) {
            setLessons([]);
            setSelectedLessonId("");
            return;
        }
        const fetchLessons = async () => {
            try {
                const res = await fetch(`${apiBaseUrl}/lesson_registrations/calendar?academic_year=${selectedAcademicYear}&class_id=${selectedClassId}`);
                if (!res.ok) throw new Error("授業一覧の取得に失敗しました");
                
                // ▼▼▼【修正】any型を排除し、厳密な型チェックを導入 ▼▼▼
                const data: LessonCalendarItem[] = await res.json();
                const filteredData = data.filter((item): item is LessonCalendarItem & { lesson_id: number } => item.lesson_id != null);
                
                setLessons(filteredData.map((item) => ({
                    lesson_id: item.lesson_id,
                    lesson_name: item.lesson_name || "物理",
                    date: item.date,
                    period: item.period
                })));
                // ▲▲▲【修正】ここまで ▲▲▲

                // 授業リストが更新されたら、選択中の授業をリセット
                setSelectedLessonId("");
            } catch (error) {
                console.error(error);
                // エラーが発生した場合もリストと選択を空にする
                setLessons([]);
                setSelectedLessonId("");
                setError(error instanceof Error ? error.message : String(error));
            }
        };
        fetchLessons();
    }, [selectedClassId, selectedAcademicYear]);

    useEffect(() => {
        if (!selectedLessonId || !apiBaseUrl || !selectedAcademicYear) {
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
                const grade = currentClass ? currentClass.grade : 1;

                const [rawRes, commentRes, gradeSummaryRes] = await Promise.all([
                    fetch(`${apiBaseUrl}/grades/raw_data?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/comments?lesson_id=${selectedLessonId}`),
                    fetch(`${apiBaseUrl}/grades/grade_summary?academic_year=${academic_year}&grade=${grade}`)
                ]);
                
                if (!rawRes.ok) throw new Error('回答データの取得に失敗しました');
                setRawData(await rawRes.json());
                
                if (commentRes.ok) {
                    const commentData = await commentRes.json();
                    setComments(commentData.comments || []);
                }
                
                if (gradeSummaryRes.ok) {
                    const summaryData = await gradeSummaryRes.json();
                    setGradeSummary(summaryData.summary || []);
                } else {
                    setGradeSummary([]);
                }

            } catch (error) {
                console.error(error);
                setError(error instanceof Error ? error.message : String(error));
            } finally {
                setLoading(false);
            }
        };
        fetchGradesData();
    }, [selectedLessonId, classes, selectedClassId, selectedAcademicYear]);

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
                    correct: 0, total: 0,
                    choiceDistribution: { A: 0, B: 0, C: 0, D: 0 },
                    correctChoice: item.question.correct_choice,
                    correctTimes: [], incorrectTimes: []
                };
            }
            if (item.answer.selected_choice) {
                totalAnswers++;
                questionStats[label].total++;
                questionStats[label].choiceDistribution[item.answer.selected_choice]++;
                const answerTime = item.answer.end_unix && item.answer.start_unix ? item.answer.end_unix - item.answer.start_unix : 0;
                if (item.answer.is_correct) {
                    totalCorrect++;
                    questionStats[label].correct++;
                    if (answerTime > 0) questionStats[label].correctTimes.push(answerTime);
                } else {
                    if (answerTime > 0) questionStats[label].incorrectTimes.push(answerTime);
                }
            }
        });

        const classAverage = totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;

        let bestQuestion = "N/A", worstQuestion = "N/A";
        let bestRate = -1, worstRate = 101;

        Object.values(questionStats).forEach(stats => {
            const rate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
            
            const fullLabel = [stats.part_name, stats.chapter_name, stats.unit_name, stats.lesson_theme_name]
                .filter(Boolean)
                .join(" - ");

            if (rate > bestRate) {
                bestRate = rate;
                bestQuestion = fullLabel || stats.question_label; 
            }
            if (rate < worstRate) {
                worstRate = rate;
                worstQuestion = fullLabel || stats.question_label;
            }
        });

        let gradeAverage = 0;
        if (gradeSummary.length > 0) {
            const totalGradeCorrect = gradeSummary.reduce((acc, item) => acc + item.correct_answers, 0);
            const totalGradeAnswers = gradeSummary.reduce((acc, item) => acc + item.total_answers, 0);
            if (totalGradeAnswers > 0) {
                gradeAverage = (totalGradeCorrect / totalGradeAnswers) * 100;
            }
        }

        return { classAverage, questionStats, bestQuestion, worstQuestion, gradeAverage };
    }, [rawData, gradeSummary]);

    const keywordAnalysis = useMemo(() => {
        const keywords: { [key: string]: number } = {};
        comments.forEach(c => {
            if (c.comment_text) {
                c.comment_text.match(/[\u30a0-\u30ff\u3040-\u309f\u4e00-\u9faf\w]+/g)?.forEach(word => {
                    if (word.length > 1) { 
                        keywords[word] = (keywords[word] || 0) + 1;
                    }
                });
            }
        });
        return Object.entries(keywords).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [comments]);
    const selectedLesson = lessons.find(l => l.lesson_id === parseInt(selectedLessonId));
    const selectedClass = classes.find(c => c.class_id === parseInt(selectedClassId));
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${days[date.getDay()]}）`;
    };

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
                         onChange={(e) => setSelectedClassId(e.target.value)}
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
                         {lessons.map(l => <option key={l.lesson_id} value={l.lesson_id}>
                             {formatDate(l.date)} {l.period}限 {l.lesson_name}
                         </option>)}
                     </select>
                 </div>
             </div>

            {loading && <div className="text-center py-10 text-gray-500">分析データを読み込み中...</div>}
            {error && <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-lg">{error}</div>}

            {!loading && !error && statistics && (
                <main className="space-y-8">
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                        <h1 className="text-2xl font-bold text-gray-800">
                            {selectedAcademicYear}年度 {selectedClass?.class_name} {selectedLesson?.lesson_name} 学習結果分析
                        </h1>
                        <p className="text-gray-500">
                            {selectedLesson && formatDate(selectedLesson.date)} {selectedLesson?.period}限
                        </p>
                    </div>

                    <section className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-sm font-bold text-gray-800 pb-2 mb-6 border-b-2 border-gray-200">全体サマリー分析</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            <SummaryCard title="クラス平均正答率" value={`${Math.round(statistics.classAverage)}%`} color="blue" description="この授業における全問題の正答率の平均値です。" />
                            <SummaryCard 
                                title="学年平均正答率" 
                                value={statistics.gradeAverage >= 0 ? `${Math.round(statistics.gradeAverage)}%` : "- %"} 
                                color="gray" 
                                description="学年全体の総正解数÷総回答数で算出した平均値です。" 
                            />
                            <SummaryCard title="クラス正答率が高い問題" value={statistics.bestQuestion} color="emerald" description="この授業で最もクラスの正答率が高かった問題です。" isProblemCard={true} />
                            <SummaryCard title="クラス正答率が低い問題" value={statistics.worstQuestion} color="amber" description="この授業で最もクラスの正答率が低かった問題です。" isProblemCard={true} />
                        </div>
                    </section>
                    
                    <section className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 pb-2 mb-6 border-b-2 border-gray-200">設問別 詳細分析</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-8">
                            {Object.entries(statistics.questionStats).map(([label, stats]) => {
                                const gradeAvgItem = gradeSummary.find(item => item.question_id === stats.question_id);
                                return <QuestionDetailCard key={label} label={label} stats={stats} gradeAvg={gradeAvgItem?.correct_rate} />;
                            })}
                        </div>
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


const SummaryCard = ({ title, value, color, description, isProblemCard }: { title: string, value: string, color: string, description: string, isProblemCard?: boolean }) => {
    const colors = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', value: 'text-blue-800' },
        gray: { bg: 'bg-gray-50', text: 'text-gray-600', value: 'text-gray-700' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', value: 'text-emerald-800' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-700', value: 'text-amber-800' }
    };
    const c = colors[color as keyof typeof colors] || colors.gray;

    return (
        <div className={`${c.bg} p-4 rounded-lg text-center flex flex-col justify-center min-h-[140px]`} title={description}>
            <p className={`${c.text} mb-2`}>{title}</p>
            <p className={`${c.value} font-bold break-words px-2`}>
                {value}
            </p>
        </div>
    );
};

const QuestionDetailCard = ({ label, stats, gradeAvg }: { label: string, stats: QuestionStats, gradeAvg?: number }) => {
    const correctRate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    const rateColor = correctRate >= 80 ? 'green' : correctRate >= 50 ? 'orange' : 'red';
    const rateClasses = {
        green: 'font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded',
        orange: 'font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded',
        red: 'font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded',
    };
    const fullQuestionLabel = [stats.part_name, stats.chapter_name, stats.unit_name, stats.lesson_theme_name].filter(Boolean).join(" - ");

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-4 flex flex-col">
            <div>
                <div className="flex flex-wrap justify-between items-baseline gap-2">
                    <h3 className="font-bold text-lg text-gray-800" title={`元のラベル: ${label}`}>{fullQuestionLabel}</h3>
                    <div className="flex items-baseline gap-2 text-sm flex-shrink-0">
                        <span className={rateClasses[rateColor]}>クラス: {Math.round(correctRate)}%</span>
                        <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                           学年: {gradeAvg != null ? `${Math.round(gradeAvg)}%` : " - "}
                        </span>
                    </div>
                </div>
            </div>
            <div>
                <p className="font-semibold text-sm text-gray-600 mb-2">回答選択率</p>
                <div className="space-y-1 text-sm">
                    {['A', 'B', 'C', 'D'].map(choice => {
                        const isCorrect = choice === stats.correctChoice;
                        const percentage = stats.total > 0 ? (stats.choiceDistribution[choice] || 0) / stats.total * 100 : 0;
                        return (
                            <div key={choice} className="flex items-center gap-2">
                                <span className={`w-8 text-center ${isCorrect ? 'font-bold text-green-600' : ''}`}>{choice}</span>
                                <div className={`w-full ${isCorrect ? 'bg-green-200' : 'bg-gray-200'} rounded-full h-4`}>
                                    <div className={`${isCorrect ? 'bg-green-500' : 'bg-gray-400'} h-4 rounded-full`} style={{ width: `${percentage}%` }}></div>
                                </div>
                                <span className="w-8 text-right font-mono">{Math.round(percentage)}%</span>
                                <span className="w-16 text-left text-green-600 font-bold">{isCorrect && '(正解)'}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <AnswerTimeDistribution stats={stats} />
        </div>
    );
};

const AnswerTimeDistribution = ({ stats }: { stats: QuestionStats }) => {
    const avgCorrect = stats.correctTimes.length > 0 ? Math.round(stats.correctTimes.reduce((a, b) => a + b, 0) / stats.correctTimes.length) : 0;
    const avgIncorrect = stats.incorrectTimes.length > 0 ? Math.round(stats.incorrectTimes.reduce((a, b) => a + b, 0) / stats.incorrectTimes.length) : 0;
    
    const correctTitle = `正解者` + (stats.correctTimes.length > 0 ? ` (平均: ${avgCorrect}秒)` : '');
    const incorrectTitle = `不正解者` + (stats.incorrectTimes.length > 0 ? ` (平均: ${avgIncorrect}秒)` : '');

    return (
        <div className="flex-grow flex flex-col">
            <div className="flex justify-between items-center">
                <p className="font-semibold text-sm text-gray-600">回答時間 分布</p>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                        <span>平均</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400"></span>
                        <span>正解者</span>
                    </div>
                     <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <span>不正解者</span>
                    </div>
                </div>
            </div>
            <div className="space-y-4 text-sm mt-2 flex-grow">
                <DotPlot title={correctTitle} times={stats.correctTimes} color="green" avgTime={avgCorrect} />
                <DotPlot title={incorrectTitle} times={stats.incorrectTimes} color="gray" avgTime={avgIncorrect} />
            </div>
        </div>
    );
};
const DotPlot = ({ title, times, color, avgTime }: { title: string, times: number[], color: 'green' | 'gray', avgTime: number }) => {
    const maxTime = 600; 
    const timeCounts: { [time: number]: number } = {};
    times.forEach(t => {
        const timeKey = Math.round(t / 10) * 10;
        timeCounts[timeKey] = (timeCounts[timeKey] || 0) + 1;
    });

    return (
        <div className="flex-grow">
            <span className={`font-medium text-xs ${color === 'green' ? 'text-green-700' : 'text-gray-700'}`}>{title}</span>
            <div className="dot-plot-container">
                <div className="dot-container">
                    {Object.entries(timeCounts).map(([time, count]) => {
                        const position = (Number(time) / maxTime) * 100;
                        return Array.from({ length: count }).map((_, i) => (
                             <span
                                key={`${time}-${i}`}
                                className={`dot ${color === 'green' ? 'bg-green-400' : 'bg-gray-400'} ${i > 0 ? `dot-stack-${i + 1}` : ''}`}
                                style={{ left: `${position}%` }}
                                title={`${time}秒`}
                            ></span>
                        ));
                    })}
                </div>
                <div className="axis-container">
                    <div className="axis-line"></div>
                    <span className="axis-label" style={{ left: '0%' }}>0s</span>
                    <span className="axis-label" style={{ left: '50%' }}>300s</span>
                    <span className="axis-label" style={{ left: '100%' }}>600s</span>
                    {times.length > 0 && (
                        <div className="avg-marker" style={{ left: `${(avgTime / maxTime) * 100}%` }} title={`平均: ${avgTime}秒`}>
                            <svg className={`w-full h-full ${color === 'green' ? 'text-green-600' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                            </svg>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
const KeywordMap = ({ keywords }: { keywords: [string, number][] }) => {
    const maxCount = keywords.length > 0 ? Math.max(...keywords.map(k => k[1])) : 1;
    const getStyle = (count: number) => {
        const baseSize = 0.8, maxSize = 2.2;
        const size = baseSize + (maxSize - baseSize) * (Math.log(count) / Math.log(maxCount || 1));
        const opacity = 0.6 + (0.4 * (count / maxCount));
        return { fontSize: `${size}rem`, lineHeight: 1, opacity: opacity, };
    };
    return (
        <div>
            <h3 className="font-semibold text-gray-700 mb-3 text-center">キーワードマップ</h3>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-4 border bg-gray-50 rounded-lg min-h-[180px]">
                {keywords.length > 0
                    ? keywords.map(([word, count]) => (
                        <span key={word} className="text-sky-800 font-semibold" style={getStyle(count)}>{word}</span>
                    )) 
                    : <p className="text-gray-500">コメントからキーワードは抽出されませんでした。</p>
                }
            </div>
        </div>
    );
};
const CommentsList = ({ comments }: { comments: CommentData[] }) => (
    <div>
        <h3 className="font-semibold text-gray-700 mb-3 text-center">主なコメント</h3>
        <div className="space-y-3">
            {comments.filter(c => c.comment_text).length > 0 ? comments.slice(0, 3).map((c, i) => (
                c.comment_text ? <div key={i} className="bg-gray-100 p-3 rounded-lg text-sm text-gray-800">「{c.comment_text}」</div> : null
            )) : <div className="text-gray-500 text-sm text-center bg-gray-50 rounded-lg p-4 min-h-[180px] flex items-center justify-center">有効なコメントはありませんでした。</div>}
        </div>
    </div>
);
"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function QuestionsListPageContent() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const router = useRouter();
  const searchParams = useSearchParams();
  // ダッシュボードやcontent-selectionから受け取る
  const lessonIdStr = searchParams.get("lesson_id");
  const lessonId = lessonIdStr ? parseInt(lessonIdStr, 10) : null;

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

  const [lessonInfo, setLessonInfo] = useState<LessonInformation | null>(null);

  /* sessionStorage から授業メタ（date・時限・科目名）を読む */
  const [lessonMeta, setLessonMeta] = useState<{
    date: string;
    day_of_week: string;
    period: number;
    lesson_name: string | null;
  } | null>(null);

  const [selectedContent, setSelectedContent] = useState<{
    lesson_theme_id: number;
    lesson_theme_name: string;
    material_name: string;
    part_name: string | null;
    chapter_name: string | null;
    unit_name: string | null;
  } | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("selectedLessonMeta");
      if (s) setLessonMeta(JSON.parse(s));
    } catch {}
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

  const dateSrc = lessonInfo ?? lessonMeta;      // ← どちらかあれば OK
  const dateInfo = dateSrc
    ? `${dateSrc.date} (${dateSrc.day_of_week}) / ${dateSrc.period}限目 ${dateSrc.lesson_name ?? ""}`
    : "";
  const firstTheme = lessonInfo ? Object.values(lessonInfo.lesson_theme)[0] : undefined;
  const src = selectedContent ?? firstTheme;
  const contentInfo = src
    ? `${src.lesson_theme_name} / ${src.material_name} ${src.part_name ?? ""} ${src.chapter_name ?? ""} ${src.unit_name ?? ""}`.trim()
    : "";

  // ダミーデータ
  const [questions, setQuestions] = useState([
    {
      id: 1,
      name: "生徒A",
      content: "「速さ」と「速度」の違いは何ですか？具体的な例で説明してください",
      checked: false,
    },
    {
      id: 2,
      name: "生徒B",
      content: "等速直線運動をしている物体の速度を求めるにはどうすればいいですか？",
      checked: true,
    },
    {
      id: 3,
      name: "生徒D",
      content: "秒速5mの物体が10秒間動いたとき、移動距離はどう求められますか？",
      checked: false,
    },
    {
      id: 4,
      name: "生徒A",
      content: "速度の単位としてm/sとkm/hがありますが、どうやって換算するのですか？",
      checked: false,
    },
    {
      id: 5,
      name: "生徒D",
      content: "自転車で坂を下るとき、速度はどのように変化しますか？",
      checked: true,
    },
  ]);

  const handleBack = () => {
    router.back();
  };

  const handleSort = () => {
    const sorted = [...questions].sort((a, b) => {
      if (!a.checked && b.checked) return 1;
      if (a.checked && !b.checked) return -1;
      return 0;
    });
    setQuestions(sorted);
  };

  const toggleCheck = (id: number) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, checked: !q.checked } : q))
    );
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <button onClick={handleBack} className="font-bold hover:underline">
          &lt; 戻る
        </button>
        <span className="text-xl font-bold">質問一覧</span>
      </div>

      {/* 授業情報 + 並び替え */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-gray-600">
          {dateInfo}
          <br />
          {contentInfo}
        </div>
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          onClick={handleSort}
        >
          並び替え
        </button>
      </div>

      {/* テーブル */}
      <table className="w-full border border-gray-200 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border-b border-gray-200">名前</th>
            <th className="p-2 border-b border-gray-200">質問内容</th>
            <th className="p-2 border-b border-gray-200">チェック</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id}>
              <td className="p-2 border-b border-gray-200">{q.name}</td>
              <td className="p-2 border-b border-gray-200">{q.content}</td>
              <td className="p-2 border-b border-gray-200 text-center">
                <input
                  type="checkbox"
                  aria-label={`質問「${q.content}」のチェック`}
                  className="w-4 h-4"
                  checked={q.checked}
                  onChange={() => toggleCheck(q.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QuestionsListPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QuestionsListPageContent />
    </Suspense>
  );
}
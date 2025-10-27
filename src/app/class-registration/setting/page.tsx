"use client"
export const dynamic = "force-dynamic";
import React, { useState, useEffect, Suspense, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { apiBaseUrl } from '@/lib/apiConfig';

type Material = {
  material_id: number
  material_name: string
}

type UnitData = {
  units_id: number
  unit_name: string
  material_id: number
  part_name: string
  chapter_name: string
}

type LessonTheme = {
  units_id: number
  lesson_theme_name: string
  lesson_theme_id: number
}

type ClassData = {
  class_id: number
  class_name: string
  grade: number
}

interface RowData {
  no: number
  selectedMaterialId: number | null
  selectedPartName: string
  selectedChapterName: string
  selectedUnitName: string
  selectedThemeId: number | null
}

function SettingPageContent() {
  const searchParams = useSearchParams()
  const timetableIdStr = searchParams.get("tid")
  const timetableId = timetableIdStr ? parseInt(timetableIdStr, 10) : null

  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<UnitData[]>([])
  const [lessonThemes, setLessonThemes] = useState<LessonTheme[]>([])
  const [classes, setClasses] = useState<ClassData[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [rows, setRows] = useState<RowData[]>([
    {
      no: 1,
      selectedMaterialId: null,
      selectedPartName: "",
      selectedChapterName: "",
      selectedUnitName: "",
      selectedThemeId: null,
    },
  ])

  const fetchClasses = useCallback(async () => {
    if (!apiBaseUrl) {
      console.error("APIのベースURLが設定されていません。");
      return;
    }
    
    // ▼▼▼ 末尾にスラッシュを追加 ▼▼▼
    const fullUrl = `${apiBaseUrl}/classes/`;
    // ▲▲▲ 修正ここまで ▲▲▲
    
    console.log('=== fetchClasses Debug ===');
    console.log('apiBaseUrl:', apiBaseUrl);
    console.log('fullUrl:', fullUrl);
    console.log('fullUrl protocol:', new URL(fullUrl).protocol);
    
    try {
      const res = await fetch(fullUrl, { method: "GET" });
      if (!res.ok) throw new Error("クラス一覧の取得に失敗しました");
      const data = await res.json();
      setClasses(data);
      if (data.length > 0) {
        setSelectedClassId(data[0].class_id);
      }
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const fetchAllLessonData = useCallback(async () => {
    if (!apiBaseUrl) {
      console.error("APIのベースURLが設定されていません。");
      return;
    }
    try {
      const res = await fetch(
        `${apiBaseUrl}/lesson_registrations/all`,
        { method: "GET" }
      )
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`Failed to fetch lesson data: ${res.status}, ${msg}`)
      }
      const data = await res.json()
      setMaterials(data.materials || [])
      setUnits(data.units || [])
      setLessonThemes(data.lesson_themes || [])
    } catch (err) {
      console.error(err)
    }
  }, []);

  useEffect(() => {
    fetchClasses()
    fetchAllLessonData()
  }, [fetchClasses, fetchAllLessonData]);

  function addRow() {
    setRows((prev) => {
      const newNo = prev.length + 1
      return [
        ...prev,
        {
          no: newNo,
          selectedMaterialId: null,
          selectedPartName: "",
          selectedChapterName: "",
          selectedUnitName: "",
          selectedThemeId: null,
        },
      ]
    })
  }

  function handleChangeMaterial(rowIndex: number, matId: number) {
    setRows((prev) => {
      const newRows = [...prev]
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        selectedMaterialId: matId,
        selectedPartName: "",
        selectedChapterName: "",
        selectedUnitName: "",
        selectedThemeId: null,
      }
      return newRows
    })
  }

  function handleChangePart(rowIndex: number, pName: string) {
    setRows((prev) => {
      const newRows = [...prev]
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        selectedPartName: pName,
        selectedChapterName: "",
        selectedUnitName: "",
        selectedThemeId: null,
      }
      return newRows
    })
  }

  function handleChangeChapter(rowIndex: number, cName: string) {
    setRows((prev) => {
      const newRows = [...prev]
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        selectedChapterName: cName,
        selectedUnitName: "",
        selectedThemeId: null,
      }
      return newRows
    })
  }

  function handleChangeUnit(rowIndex: number, uName: string) {
    setRows((prev) => {
      const newRows = [...prev]
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        selectedUnitName: uName,
        selectedThemeId: null,
      }
      return newRows
    })
  }

  function handleChangeTheme(rowIndex: number, tId: number) {
    setRows((prev) => {
      const newRows = [...prev]
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        selectedThemeId: tId,
      }
      return newRows
    })
  }

  async function handleRegister() {
    if (!timetableId) {
      alert("timetable_idがありません。");
      return;
    }
    if (!selectedClassId) {
      alert("クラスを選択してください。");
      return;
    }

    const themeIds = rows
      .map((row) => row.selectedThemeId)
      .filter((id): id is number => id !== null && id > 0);

    if (themeIds.length === 0) {
      alert("登録するテーマを1つ以上選択してください。");
      return;
    }

    const payload = {
      class_id: selectedClassId,
      timetable_id: timetableId,
      lesson_theme_ids: themeIds,
    };

    try {
      const res = await fetch(`${apiBaseUrl}/lesson_registrations/`, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Register Lesson failed: ${res.status}, ${msg}`);
      }

      await res.json();
      alert("登録完了しました");
    } catch (error) {
      console.error(error);
      alert(`登録失敗: ${String(error)}`);
    }
  }

  function getPartNamesForRow(row: RowData) {
    if (row.selectedMaterialId == null) return []
    const filtered = units.filter((u) => u.material_id === row.selectedMaterialId)
    const uniqueParts = Array.from(new Set(filtered.map((f) => f.part_name)))
    return uniqueParts
  }

  function getChapterNamesForRow(row: RowData) {
    if (row.selectedMaterialId == null || !row.selectedPartName) return []
    const filtered = units.filter(
      (u) =>
        u.material_id === row.selectedMaterialId && u.part_name === row.selectedPartName
    )
    const uniqueChapters = Array.from(new Set(filtered.map((f) => f.chapter_name)))
    return uniqueChapters
  }

  function getUnitNamesForRow(row: RowData) {
    if (
      row.selectedMaterialId == null ||
      !row.selectedPartName ||
      !row.selectedChapterName
    )
      return []
    const filtered = units.filter(
      (u) =>
        u.material_id === row.selectedMaterialId &&
        u.part_name === row.selectedPartName &&
        u.chapter_name === row.selectedChapterName
    )
    const uniqueUnits = Array.from(new Set(filtered.map((f) => f.unit_name)))
    return uniqueUnits
  }

  function getThemesForRow(row: RowData) {
    if (
      row.selectedMaterialId == null ||
      !row.selectedPartName ||
      !row.selectedChapterName ||
      !row.selectedUnitName
    )
      return []
    const foundUnit = units.find(
      (u) =>
        u.material_id === row.selectedMaterialId &&
        u.part_name === row.selectedPartName &&
        u.chapter_name === row.selectedChapterName &&
        u.unit_name === row.selectedUnitName
    )
    if (!foundUnit) return []
    const filteredTheme = lessonThemes.filter((t) => t.units_id === foundUnit.units_id)
    return filteredTheme
  }

  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => history.back()} className="font-bold hover:underline mr-4">
            &lt; 戻る
          </button>
        </div>
        <div className="flex gap-4 items-center">
          <div>
            <label className="text-sm mr-2">クラス:</label>
            <select
              className="border border-gray-300 rounded px-2 py-1"
              value={selectedClassId ?? ""}
              onChange={(e) => setSelectedClassId(parseInt(e.target.value, 10) || null)}
            >
              <option value="">選択してください</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>
          <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            一時保存
          </button>
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            onClick={handleRegister}
          >
            登録完了
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border border-gray-200 text-sm w-full table-fixed">
          <thead className="bg-gray-100">
            <tr className="text-center">
              <th className="p-2 border-b border-gray-200 w-1/12">No.</th>
              <th className="p-2 border-b border-gray-200 w-2/12">教科書</th>
              <th className="p-2 border-b border-gray-200 w-2/12">編 (part_name)</th>
              <th className="p-2 border-b border-gray-200 w-2/12">章 (chapter_name)</th>
              <th className="p-2 border-b border-gray-200 w-2/12">単元 (unit_name)</th>
              <th className="p-2 border-b border-gray-200 w-2/12">テーマ</th>
              <th className="p-2 border-b border-gray-200 w-2/12">
                学習コンテンツ登録状況
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const partNames = getPartNamesForRow(row)
              const chapterNames = getChapterNamesForRow(row)
              const unitNames = getUnitNamesForRow(row)
              const themes = getThemesForRow(row)

              return (
                <tr key={idx} className="text-center">
                  <td className="p-2 border-b border-gray-200">{row.no}</td>
                  <td className="p-2 border-b border-gray-200">
                    <select
                      aria-label="教科書の選択"
                      className="border border-gray-300 rounded px-1 py-0.5 text-center"
                      value={row.selectedMaterialId ?? ""}
                      onChange={(e) => {
                        handleChangeMaterial(idx, parseInt(e.target.value, 10) || 0)
                      }}
                    >
                      <option value="">選択</option>
                      {materials.map((m) => (
                        <option key={m.material_id} value={m.material_id}>
                          {m.material_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b border-gray-200">
                    <select
                      aria-label="編の選択"
                      className="border border-gray-300 rounded px-1 py-0.5 text-center"
                      value={row.selectedPartName}
                      onChange={(e) => handleChangePart(idx, e.target.value)}
                    >
                      <option value="">選択</option>
                      {partNames.map((pn) => (
                        <option key={pn} value={pn}>
                          {pn}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b border-gray-200">
                    <select
                      aria-label="章の選択"
                      className="border border-gray-300 rounded px-1 py-0.5 text-center"
                      value={row.selectedChapterName}
                      onChange={(e) => handleChangeChapter(idx, e.target.value)}
                    >
                      <option value="">選択</option>
                      {chapterNames.map((cn) => (
                        <option key={cn} value={cn}>
                          {cn}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b border-gray-200">
                    <select
                      aria-label="単元の選択"
                      className="border border-gray-300 rounded px-1 py-0.5 text-center"
                      value={row.selectedUnitName}
                      onChange={(e) => handleChangeUnit(idx, e.target.value)}
                    >
                      <option value="">選択</option>
                      {unitNames.map((un) => (
                        <option key={un} value={un}>
                          {un}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b border-gray-200">
                    <select
                      aria-label="テーマの選択"
                      className="border border-gray-300 rounded px-1 py-0.5 text-center"
                      value={row.selectedThemeId ?? ""}
                      onChange={(e) =>
                        handleChangeTheme(idx, parseInt(e.target.value, 10) || 0)
                      }
                    >
                      <option value="">選択</option>
                      {themes.map((t) => (
                        <option key={t.lesson_theme_id} value={t.lesson_theme_id}>
                          {t.lesson_theme_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b border-gray-200 text-red-500">
                    すべてのコンテンツが登録されています
                  </td>
                </tr>
              )
            })}
            <tr>
              <td colSpan={7} className="p-2 border-b border-gray-200 text-center">
                <button
                  onClick={addRow}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                >
                  ＋
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ClassRegistrationSettingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SettingPageContent />
    </Suspense>
  )
}
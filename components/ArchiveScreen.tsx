import React, { useEffect, useState, useRef } from 'react';
import { CompletedInspection } from '../types';
import { loadArchive, deleteFromArchive, loadArchivedItemDetail, restoreArchivedItemLegacy, exportArchiveData, importArchiveData } from '../services/storage';
import { Trash2, Calendar, FileText, ArrowRight, ArrowLeft, RotateCcw, Home, Upload, Download, Loader2, Share2, CheckSquare, Square, X, CheckCircle2, Check, CheckCheck } from 'lucide-react';

interface ArchiveScreenProps {
  onLoad: (info: any, defects: any, locations: any) => void;
  onGoBack: () => void;
  onGoHome: () => void;
}

const ArchiveScreen: React.FC<ArchiveScreenProps> = ({ onLoad, onGoBack, onGoHome }) => {
  const [items, setItems] = useState<CompletedInspection[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToRestore, setItemToRestore] = useState<CompletedInspection | null>(null);
  const [processing, setProcessing] = useState(false);
  
  // File Input Ref for Import
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadArchive().then(data => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  // Selection Handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set()); // Reset on toggle
  };

  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const requestDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    setProcessing(true);
    try {
      if (itemToDelete) {
        // Single delete
        const newItems = await deleteFromArchive(itemToDelete);
        setItems(newItems);
        setItemToDelete(null);
      } else if (isSelectionMode && selectedIds.size > 0) {
        // Bulk delete
        let currentItems = items;
        for (const id of selectedIds) {
           currentItems = await deleteFromArchive(id);
        }
        setItems(currentItems);
        setIsSelectionMode(false);
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.error("Delete failed", e);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const requestRestore = (item: CompletedInspection) => {
    if (isSelectionMode) {
      toggleItemSelection(item.id);
    } else {
      setItemToRestore(item);
    }
  };

  const confirmRestore = async () => {
    if (!itemToRestore) return;
    setProcessing(true);
    try {
      // Use setTimeout to allow UI to update (show loading state)
      setTimeout(async () => {
        try {
          let defects = [];
          let locations = [];

          // 1. Try to load detailed data from split storage
          const detail = await loadArchivedItemDetail(itemToRestore.id);
          
          if (detail) {
            defects = detail.defects;
            locations = detail.locations;
          } else {
            // 2. Fallback: Check if it's a legacy item with data inside the index
            if (itemToRestore.defects && itemToRestore.defects.length > 0) {
               const legacy = restoreArchivedItemLegacy(itemToRestore);
               defects = legacy.defects;
               locations = itemToRestore.locations;
            }
          }
          
          // Default locations if missing
          if (!locations || !Array.isArray(locations) || locations.length === 0) {
             locations = ['현관', '거실', '주방', '침실1', '침실2', '침실3', '공용욕실', '부부욕실', '발코니', '다용도실'];
          }

          if (defects.length === 0 && (itemToRestore.defectCount || 0) > 0) {
              alert('데이터를 찾을 수 없습니다.');
          } else {
              onLoad(itemToRestore.info, defects, locations);
          }
          setItemToRestore(null); // Close modal
        } catch (e) {
          console.error("Error restoring item:", e);
          alert('데이터를 불러오는 중 오류가 발생했습니다. 데이터가 손상되었을 수 있습니다.');
        } finally {
          setProcessing(false);
        }
      }, 50);
    } catch (e) {
       console.error("Restore outer error", e);
       setProcessing(false);
    }
  };

  const handleBackClick = () => {
    if (isSelectionMode) {
      toggleSelectionMode();
    } else {
      setShowExitDialog(true);
    }
  };

  // --- Export / Import Handlers ---
  const handleExport = async () => {
    // If in selection mode, use selected IDs. Else, export all.
    // FIX: Explicitly cast to string[] to avoid unknown[] inference error
    const idsToExport = isSelectionMode ? Array.from(selectedIds) as string[] : undefined;

    if (isSelectionMode && selectedIds.size === 0) {
        alert("선택된 항목이 없습니다.");
        return;
    }

    if (!isSelectionMode && items.length === 0) {
      alert("내보내거나 데이터가 없습니다.");
      return;
    }
    
    setProcessing(true);
    try {
      // Pass the selected IDs to the service function
      const jsonString = await exportArchiveData(idsToExport);
      if (!jsonString) return;

      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      const count = idsToExport ? idsToExport.length : items.length;
      
      link.href = url;
      link.download = `DoubleCheck_Backup_${count}items_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // If success in selection mode, exit selection
      if(isSelectionMode) toggleSelectionMode();
      
    } catch (e) {
      console.error("Export failed", e);
      alert("데이터 내보내기 실패. 파일 크기가 너무 클 수 있습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    try {
      const text = await file.text();
      const newItems = await importArchiveData(text);
      setItems(newItems); // Update list
      alert("데이터를 성공적으로 가져왔습니다.");
    } catch (err) {
      console.error("Import failed", err);
      alert("데이터 가져오기 실패. 올바른 백업 파일인지 확인해주세요.");
    } finally {
      setProcessing(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-500 gap-2">
        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600"></span>
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-white min-h-full pb-32 relative">
      <div className="p-6 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white/95 backdrop-blur-sm z-20">
        <div>
          <h2 className="text-xl font-bold text-gray-800">
             {isSelectionMode ? `${selectedIds.size}개 선택됨` : '점검 완료 보관함'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
             {isSelectionMode ? '내보내거나 삭제할 항목을 선택하세요.' : '완료된 점검 내역입니다.'}
          </p>
        </div>
        <div className="flex gap-2">
           {/* Hidden Input for Import */}
           <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".json" 
            className="hidden" 
          />
          
          {isSelectionMode ? (
              <button 
                onClick={toggleSelectionMode}
                className="flex flex-col items-center justify-center text-gray-500 hover:text-gray-800 p-2 rounded-lg bg-gray-50 transition"
              >
                  <X size={20} />
                  <span className="text-[10px] font-bold mt-1">취소</span>
              </button>
          ) : (
             <>
                <button 
                    onClick={handleImportClick}
                    disabled={processing}
                    className="flex flex-col items-center justify-center text-gray-600 hover:text-brand-600 p-2 rounded-lg bg-gray-50 hover:bg-brand-50 transition"
                    title="데이터 가져오기 (Merge)"
                >
                    <Download size={20} />
                    <span className="text-[10px] font-bold mt-1">가져오기</span>
                </button>
                <button 
                    onClick={toggleSelectionMode}
                    disabled={items.length === 0}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition
                    ${items.length === 0 ? 'text-gray-300 bg-gray-50' : 'text-gray-600 hover:text-brand-600 bg-gray-50 hover:bg-brand-50'}`}
                >
                    <CheckSquare size={20} />
                    <span className="text-[10px] font-bold mt-1">선택</span>
                </button>
             </>
          )}
        </div>
      </div>

      {processing && (
        <div className="absolute top-[80px] left-0 right-0 z-10 bg-brand-50 text-brand-700 text-xs font-bold py-2 text-center animate-pulse">
          데이터 처리 중입니다... 잠시만 기다려주세요.
        </div>
      )}

      <div className="p-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">보관된 점검 내역이 없습니다.</p>
            <p className="text-xs text-gray-400 mt-2">다른 기기의 데이터를 보려면<br/>상단의 '가져오기'를 사용하세요.</p>
          </div>
        ) : (
          items.map((item) => {
            // Count logic handling both new and legacy data
            const count = item.defectCount !== undefined ? item.defectCount : (item.defects ? item.defects.length : 0);
            const isSelected = selectedIds.has(item.id);
            
            return (
              <div 
                key={item.id} 
                onClick={() => requestRestore(item)}
                className={`
                    border rounded-xl p-5 shadow-sm transition cursor-pointer relative group flex items-start gap-3
                    ${isSelected 
                        ? 'bg-brand-50 border-brand-300 ring-1 ring-brand-300' 
                        : 'bg-white border-gray-200 active:bg-gray-50 hover:border-brand-200'}
                `}
              >
                {/* Checkbox for Selection Mode */}
                {isSelectionMode && (
                    <div className="pt-1 flex-shrink-0">
                        {isSelected ? (
                            <div className="bg-brand-500 text-white rounded-full p-0.5">
                                <CheckCircle2 size={20} fill="currentColor" className="text-white" />
                            </div>
                        ) : (
                            <div className="border-2 border-gray-300 rounded-full w-[22px] h-[22px]"></div>
                        )}
                    </div>
                )}

                <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className={`font-bold text-lg ${isSelected ? 'text-brand-900' : 'text-gray-800'}`}>
                                {item.info.apartmentName} {item.info.unit}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">{item.info.typeSize} · {item.info.inspectorName}</p>
                        </div>
                        {/* Show delete button only if NOT in selection mode */}
                        {!isSelectionMode && (
                            <button 
                                onClick={(e) => requestDelete(item.id, e)}
                                className="text-gray-400 hover:text-red-500 p-2 -mr-2 -mt-2 rounded-full hover:bg-gray-100 transition z-10"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3 mt-2">
                        <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {new Date(item.info.date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                            <FileText size={14} />
                            하자 {count}건
                        </span>
                        {!isSelectionMode && (
                            <span className="ml-auto flex items-center text-brand-600 font-medium">
                                불러오기 <ArrowRight size={14} className="ml-1" />
                            </span>
                        )}
                    </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 pb-safe z-30">
         {isSelectionMode ? (
            <div className="flex gap-2 max-w-md mx-auto">
                 <button 
                    onClick={handleSelectAll}
                    className="px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition text-sm flex-shrink-0"
                >
                    {selectedIds.size === items.length ? <CheckCheck size={20}/> : <CheckSquare size={20}/>}
                </button>
                 <button 
                    onClick={() => setItemToDelete('BULK')} // Trigger bulk delete confirmation
                    disabled={selectedIds.size === 0 || processing}
                    className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 flex items-center justify-center gap-2"
                >
                    <Trash2 size={18} />
                    삭제 ({selectedIds.size})
                </button>
                <button 
                    onClick={handleExport}
                    disabled={selectedIds.size === 0 || processing}
                    className="flex-[2] py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                    <Upload size={18} />
                    내보내기 ({selectedIds.size})
                </button>
            </div>
         ) : (
            <button 
                onClick={handleBackClick}
                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition max-w-md mx-auto block"
            >
                돌아가기
            </button>
         )}
      </div>

      {/* Delete Confirmation Modal (Handles both single and bulk) */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setItemToDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="bg-red-100 p-2 rounded-full">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                  {itemToDelete === 'BULK' ? `${selectedIds.size}개 항목을 삭제하시겠습니까?` : '삭제하시겠습니까?'}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              선택하신 점검 내역이 영구적으로 삭제됩니다.<br/>삭제 후에는 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                disabled={processing}
              >
                취소
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                disabled={processing}
              >
                {processing ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span> : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {itemToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setItemToRestore(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 text-brand-600">
              <div className="bg-brand-100 p-2 rounded-full">
                <RotateCcw size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">불러오시겠습니까?</h3>
            </div>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              이 데이터를 불러오면 현재 작성 중이던 내용은 덮어씌워집니다. 계속하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setItemToRestore(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                disabled={processing}
              >
                취소
              </button>
              <button 
                onClick={confirmRestore}
                className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                disabled={processing}
              >
                {processing ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span> : '불러오기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Dialog Modal */}
      {showExitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200" onClick={() => setShowExitDialog(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">어디로 돌아가시겠습니까?</h3>
            <p className="text-gray-500 text-sm mb-6">원하시는 이동 경로를 선택해주세요.</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={onGoBack}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                <ArrowLeft size={18} />
                이전 화면으로
              </button>
              <button 
                onClick={onGoHome}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Home size={18} />
                초기 화면으로
              </button>
              <button 
                onClick={() => setShowExitDialog(false)}
                className="mt-2 text-gray-400 text-sm py-2 hover:text-gray-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchiveScreen;
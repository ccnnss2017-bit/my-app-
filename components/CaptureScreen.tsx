
import React, { useState, useRef, useEffect } from 'react';
import { DefectItem, InspectionInfo, PhotoItem } from '../types';
import { Camera, Trash2, Save, Plus, MapPin, ZoomIn, X, LayoutGrid, Pencil, RefreshCw, AlertTriangle, ArrowLeftRight, Check, Image as ImageIcon, Users, Share2, Download, Upload, FileText, Send, CheckCircle2, Copy, GripVertical, Loader2, Scale, PenLine, FolderInput, FileJson } from 'lucide-react';
import { saveDraft, loadDraft, clearDraft, exportActiveDataToDataFile, mergeActiveDataFromFile, loadInfo } from '../services/storage';
import { getMatchingStandard } from '../services/pdfService';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import PhotoViewer from './PhotoViewer';

interface CaptureScreenProps {
  defects: DefectItem[];
  setDefects: React.Dispatch<React.SetStateAction<DefectItem[]>>;
  locations: string[];
  setLocations: React.Dispatch<React.SetStateAction<string[]>>;
  onFinish: () => void;
  onDefectSaved?: () => void;
}

interface PhotoData {
  url: string;
  blob: Blob;
  originalBlob?: Blob;
  isOriginal?: boolean; // Flag to identify photos loaded from existing defects
}

const MIN_FAR = 1;
const MAX_FAR = 3;
const MIN_NEAR = 1;
const MAX_NEAR = 10;

import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';

const compressImage = async (file: File): Promise<Blob> => {
  let fileToCompress: File | Blob = file;

  try {
    // Check for HEIC/HEIF
    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8
      });
      fileToCompress = Array.isArray(converted) ? converted[0] : converted;
      // If heic2any returns a blob, we can create a File from it
      if (fileToCompress instanceof Blob) {
         fileToCompress = new File([fileToCompress], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
      }
    }
  } catch (err) {
    console.error("HEIC conversion error:", err);
    // Ignore and proceed to try standard compression
  }

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.8,
    fileType: 'image/jpeg'
  };

  try {
    const compressedFile = await imageCompression(fileToCompress as File, options);
    return compressedFile;
  } catch (error) {
    console.error("Image compression error:", error);
    return fileToCompress as Blob;
  }
};

const saveToDevice = (file: File | Blob, prefix: string) => {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(2, 14);
    a.download = `DC_${prefix}_${timestamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000); 
  } catch (e) {
    console.error("Auto-save failed", e);
  }
};

const SortableItem: React.FC<{ 
  loc: string, 
  active: boolean, 
  draggingLoc: string | null,
  constraintsRef: React.RefObject<HTMLDivElement | null>,
  onDragStart: (loc: string) => void,
  onDragEnd: () => void,
  onDragTrigger: (e: any, info: PanInfo, loc: string) => void
}> = ({ loc, active, draggingLoc, constraintsRef, onDragStart, onDragEnd, onDragTrigger }) => {
  const controls = useDragControls();
  return (
    <motion.div
      layout
      data-loc={loc}
      initial={false}
      animate={{
        scale: draggingLoc === loc ? 1.05 : 1,
        zIndex: draggingLoc === loc ? 100 : 0,
        boxShadow: draggingLoc === loc ? "0px 10px 20px rgba(0,0,0,0.2)" : "0px 1px 2px rgba(0,0,0,0.05)",
        opacity: draggingLoc && draggingLoc !== loc ? 0.6 : 1
      }}
      whileDrag={{ scale: 1.1, cursor: "grabbing" }}
      drag
      dragConstraints={constraintsRef}
      dragSnapToOrigin={true}
      dragControls={controls}
      dragListener={false} 
      dragElastic={0.1}
      dragMomentum={false}
      onDragStart={() => onDragStart(loc)}
      onDragEnd={onDragEnd}
      onDrag={(e, info) => onDragTrigger(e, info, loc)}
      className={`bg-white rounded-xl border shadow-sm flex flex-col items-center justify-center select-none h-20 p-2 relative overflow-hidden transition-colors ${active ? 'border-brand-500 ring-2 ring-brand-500 bg-brand-50' : 'border-gray-200'}`}
    >
      <div className="flex-1 flex flex-col items-center justify-center w-full min-w-0">
        <div className={`p-1.5 rounded-full mb-1 ${active ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
           <MapPin size={16}/>
        </div>
        <span className={`font-bold truncate text-xs w-full text-center ${active ? 'text-brand-800' : 'text-gray-700'}`}>{loc}</span>
      </div>
      <div className="absolute top-0 right-0 p-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none" onPointerDown={(e) => controls.start(e)}>
        <GripVertical size={16} />
      </div>
    </motion.div>
  );
};

const CaptureScreen: React.FC<CaptureScreenProps> = ({ defects, setDefects, locations, setLocations, onFinish, onDefectSaved }) => {
  const [activeLocation, setActiveLocation] = useState<string>(locations[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  
  // Renaming State
  const [isRenaming, setIsRenaming] = useState(false);
  const [targetRenameLoc, setTargetRenameLoc] = useState<string | null>(null);

  const [isReordering, setIsReordering] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [isCompressing, setIsCompressing] = useState(false); 
  const [preparedFile, setPreparedFile] = useState<{file: File, type: 'JSON' | 'PDF' | 'ZIP'} | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempFarPhotos, setTempFarPhotos] = useState<PhotoData[]>([]);
  const [tempNearPhotos, setTempNearPhotos] = useState<PhotoData[]>([]);
  const [description, setDescription] = useState('');
  
  // Real-time standard matching
  const matchedStandard = getMatchingStandard(description);
  
  const cameraInputFarRef = useRef<HTMLInputElement>(null);
  const galleryInputFarRef = useRef<HTMLInputElement>(null);
  const cameraInputNearRef = useRef<HTMLInputElement>(null);
  const galleryInputNearRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerFileInput = (ref: React.RefObject<HTMLInputElement>) => {
    ref.current?.click();
  };
  
  // Ref for drag constraints
  const constraintsRef = useRef<HTMLDivElement>(null);

  const [draggingLoc, setDraggingLoc] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{isOpen: boolean; photos: string[]; index: number;}>({ isOpen: false, photos: [], index: 0 });

  const currentLocationDefects = defects.filter(d => d.location === activeLocation);

  // Load Draft
  useEffect(() => {
    const restoreDraft = async () => {
      try {
        const draft = await loadDraft();
        if (draft) {
          if (!locations.includes(draft.location)) setLocations(prev => [...prev, draft.location]);
          setActiveLocation(draft.location);
          setTempFarPhotos(draft.farPhotos);
          setTempNearPhotos(draft.nearPhotos);
          setDescription(draft.description);
          setEditingId(draft.editingId);
          setIsCreating(true);
        }
      } catch (e) {
        console.error("Failed to restore draft", e);
      } finally {
        setIsDraftLoaded(true);
      }
    };
    restoreDraft();
  }, []);

  // Save Draft
  useEffect(() => {
    if (!isDraftLoaded || !isCreating) return;
    
    const timer = setTimeout(() => {
      if (!editingId && tempFarPhotos.length === 0 && tempNearPhotos.length === 0 && !description) return;
      saveDraft({
        location: activeLocation,
        farPhotos: tempFarPhotos,
        nearPhotos: tempNearPhotos,
        description,
        editingId
      }).catch(e => console.error("Auto-save draft failed", e));
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isDraftLoaded, isCreating, activeLocation, tempFarPhotos, tempNearPhotos, description, editingId]);

  // Clean up function: Decide whether to revoke URLs based on action
  const resetForm = async (shouldRevoke: boolean = true) => {
    await clearDraft();
    
    if (shouldRevoke) {
        // Only revoke if we are discarding the photos (e.g. Cancel button)
        // CRITICAL FIX: Do NOT revoke URLs that were loaded from existing defects (isOriginal: true)
        tempFarPhotos.forEach(p => {
          if (!p.isOriginal) URL.revokeObjectURL(p.url);
        });
        tempNearPhotos.forEach(p => {
          if (!p.isOriginal) URL.revokeObjectURL(p.url);
        });
    }
    // If saving (shouldRevoke = false), we pass ownership of URLs to the main defects list, so DO NOT revoke.

    setTempFarPhotos([]);
    setTempNearPhotos([]);
    setDescription('');
    setEditingId(null);
    setIsCreating(false);
  };

  const handleStartCreation = () => {
    setTempFarPhotos([]);
    setTempNearPhotos([]);
    setDescription('');
    setEditingId(null);
    setIsCreating(true);
  };

  const handleStartEdit = async (defect: DefectItem) => {
    setIsProcessing(true);
    try {
      // Helper to ensure we have {url, blob} structure
      const restorePhotos = async (items: PhotoItem[]): Promise<PhotoData[]> => {
        return Promise.all(items.map(async item => {
          if (typeof item === 'object' && item.blob) {
             // CRITICAL FIX: Mark existing items as original so they aren't revoked on cancel
             return { ...item, isOriginal: true }; 
          }
          // Legacy string URL
          const urlStr = typeof item === 'string' ? item : item.url;
          try {
             const res = await fetch(urlStr);
             const blob = await res.blob();
             // For fetched legacy URLs, we create new URLs, so isOriginal is false (safe to revoke)
             // or we can treat them as originals if we don't want to refetch.
             // But since we created a NEW ObjectURL here, we must manage it. 
             // If we cancel, we MUST revoke this new URL. So isOriginal = false (default) is correct.
             return { url: URL.createObjectURL(blob), blob };
          } catch {
             return { url: urlStr, blob: new Blob() };
          }
        }));
      };
      
      const far = await restorePhotos(defect.farPhotos);
      const near = await restorePhotos(defect.nearPhotos);
      
      setTempFarPhotos(far);
      setTempNearPhotos(near);
      setDescription(defect.description);
      setEditingId(defect.id);
      setIsCreating(true);
    } catch (e) {
      alert("데이터를 불러오지 못했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLocation = () => {
    if (newLocationName.trim() && !locations.includes(newLocationName.trim())) {
      const newLoc = newLocationName.trim();
      setLocations([...locations, newLoc]);
      setActiveLocation(newLoc);
      setNewLocationName('');
      setIsAddingLocation(false);
    }
  };

  const handleRenameConfirm = () => {
    if (!targetRenameLoc) return;
    const oldName = targetRenameLoc;
    const newName = newLocationName.trim();

    if (!newName) {
       alert("이름을 입력해주세요.");
       return;
    }
    if (newName === oldName) {
        setTargetRenameLoc(null);
        setNewLocationName('');
        return;
    }
    if (locations.includes(newName)) {
        alert("이미 존재하는 구역 이름입니다.");
        return;
    }

    // 1. Update locations list
    setLocations(prev => prev.map(l => l === oldName ? newName : l));
    
    // 2. Update all defects using this location
    setDefects(prev => prev.map(d => d.location === oldName ? { ...d, location: newName } : d));

    // 3. Update active location if needed
    if (activeLocation === oldName) setActiveLocation(newName);

    // Reset
    setTargetRenameLoc(null);
    setNewLocationName('');
    setIsRenaming(false);
  };

  const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>, type: 'FAR' | 'NEAR') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const compressedBlob = await compressImage(file);
      const compressedUrl = URL.createObjectURL(compressedBlob);
      
      saveToDevice(compressedBlob, type === 'FAR' ? 'Far' : 'Near');
      
      const photoData: PhotoData = { url: compressedUrl, blob: compressedBlob };

      if (type === 'FAR') {
        setTempFarPhotos(prev => [...prev, photoData]);
      } else {
        setTempNearPhotos(prev => [...prev, photoData]);
      }
    } catch (err) {
      console.error("Image processing error", err);
      alert("사진 처리에 실패했습니다.");
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const removePhoto = (type: 'FAR' | 'NEAR', index: number) => {
    if (type === 'FAR') {
      const item = tempFarPhotos[index];
      if (!item.isOriginal) URL.revokeObjectURL(item.url); // Immediately revoke removed item if not original
      setTempFarPhotos(prev => prev.filter((_, i) => i !== index));
    } else {
      const item = tempNearPhotos[index];
      if (!item.isOriginal) URL.revokeObjectURL(item.url);
      setTempNearPhotos(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSaveDefect = async () => {
    if (tempFarPhotos.length < MIN_FAR || tempNearPhotos.length < MIN_NEAR || !description.trim()) {
      alert('필수 사진과 내용을 입력해주세요.');
      return;
    }

    if (!activeLocation) {
        alert("구역이 선택되지 않았습니다.");
        return;
    }

    // Pass the full PhotoData objects to the main state to keep Blobs in memory.
    const farData = [...tempFarPhotos]; 
    const nearData = [...tempNearPhotos];

    if (editingId) {
      // Keep existing location for editing, update content
      setDefects(prev => prev.map(d => d.id === editingId ? { ...d, farPhotos: farData, nearPhotos: nearData, description } : d));
    } else {
      // Use currently active location for new defect
      setDefects(prev => [...prev, { id: Date.now().toString(), location: activeLocation, farPhotos: farData, nearPhotos: nearData, description, timestamp: Date.now() }]);
    }
    
    // IMPORTANT: Pass false to prevent revoking URLs, as they are now used in the main list
    await resetForm(false);
    
    // Notify parent to create a backup snapshot
    if (onDefectSaved) {
        // Need a slight delay to ensure setDefects state is flushed to refs before snapshotting
        setTimeout(() => onDefectSaved(), 100);
    }
  };

  const handleDeleteDefect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('삭제하시겠습니까?')) {
      setDefects(prev => {
         const target = prev.find(d => d.id === id);
         // Clean up URLs for deleted defect
         if (target) {
            target.farPhotos.forEach(p => typeof p === 'string' ? {} : URL.revokeObjectURL(p.url));
            target.nearPhotos.forEach(p => typeof p === 'string' ? {} : URL.revokeObjectURL(p.url));
         }
         return prev.filter(d => d.id !== id);
      });
      if (editingId === id) resetForm(true);
    }
  };

  const handlePrepareData = async () => {
    if (defects.length === 0) {
      alert('공유할 데이터가 없습니다.');
      return;
    }
    setPreparedFile(null);
    setIsProcessing(true);
    setProcessingMsg('데이터 파일 생성 중...');
    try {
      const info = await loadInfo();
      if (!info) throw new Error("Info missing");
      const dataBlob = await exportActiveDataToDataFile(info, defects);
      const fileName = `DoubleCheck_Data_${info.unit}_${new Date().getHours()}시.zip`;
      const file = new File([dataBlob], fileName, { type: 'application/zip' });
      setPreparedFile({ file, type: 'ZIP' });
    } catch (e) { alert('데이터 생성 실패: ' + (e as any).message); } finally { setIsProcessing(false); }
  };

  const executeDownload = () => {
    if (!preparedFile) return;
    const url = URL.createObjectURL(preparedFile.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = preparedFile.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    alert("파일이 저장되었습니다. 카카오톡으로 전달하세요.");
  };

  const handleMergeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProcessingMsg('데이터 분석 및 병합 중...');
    try {
      const { mergedDefects, newLocations } = await mergeActiveDataFromFile(file);
      
      // Update locations FIRST to ensure the tabs exist
      setLocations(prev => {
        const unique = Array.from(new Set([...prev, ...newLocations]));
        return unique;
      });

      // Then update defects
      setDefects(prev => [...prev, ...mergedDefects]);
      
      setShowTeamModal(false);
      alert(`성공적으로 합쳐졌습니다! (+${mergedDefects.length}건)`);
    } catch (err: any) { alert('가져오기 실패: ' + err.message); } finally { setIsProcessing(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Helper to extract URL for display
  const getDisplayUrl = (item: PhotoItem) => {
    if (typeof item === 'string') return item;
    return item.url;
  };
  
  // Helper to get ALL URLs for viewer
  const getAllPhotoUrls = (defect: DefectItem) => [
     ...defect.farPhotos.map(getDisplayUrl),
     ...defect.nearPhotos.map(getDisplayUrl)
  ];

  const handleDrag = (e: any, { point }: PanInfo, loc: string) => {
    const elements = Array.from(document.querySelectorAll('[data-loc]'));
    const target = elements.find(el => {
        if (el.getAttribute('data-loc') === loc) return false;
        const rect = el.getBoundingClientRect();
        return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    });
    if (target) {
        const targetLoc = target.getAttribute('data-loc');
        const fromIndex = locations.indexOf(loc);
        const toIndex = locations.indexOf(targetLoc!);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
             const newLocations = [...locations];
             const [moved] = newLocations.splice(fromIndex, 1);
             newLocations.splice(toIndex, 0, moved);
             setLocations(newLocations);
        }
    }
  };

  const renderLocationItem = (loc: string) => {
    const count = defects.filter(d => d.location === loc).length;
    const isActive = activeLocation === loc;

    // Renaming Mode Logic
    if (isRenaming) {
        return (
            <button 
                key={loc} 
                onClick={() => {
                    setTargetRenameLoc(loc);
                    setNewLocationName(loc); // Pre-fill with old name
                }} 
                className={`relative px-4 py-2 rounded-xl text-sm font-bold transition-all border whitespace-nowrap animate-pulse border-brand-300 bg-brand-50 text-brand-700`}
            >
                <PenLine size={12} className="inline mr-1" />
                {loc}
            </button>
        );
    }

    return (
      <button key={loc} onClick={() => !isReordering && setActiveLocation(loc)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border whitespace-nowrap ${isActive ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white text-gray-600 border-gray-200'}`}>
        {loc} {count > 0 && <span className="text-[10px] ml-1 opacity-70">({count})</span>}
      </button>
    );
  };

  if (isCreating) {
    const currentIdx = editingId ? defects.findIndex(d => d.id === editingId) + 1 : currentLocationDefects.length + 1;
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 max-w-md mx-auto relative pb-safe animate-in fade-in zoom-in-95">
        {(isCompressing || isProcessing) && (
           <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center rounded-2xl backdrop-blur-sm">
              <Loader2 className="animate-spin text-brand-600 mb-2" size={32} />
              <p className="text-xs font-bold text-brand-700">{isCompressing ? '사진 최적화 중...' : '데이터 처리 중...'}</p>
           </div>
        )}
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-800">{editingId ? '내용 수정' : '하자 등록'}</h3>
            <span className="text-xs text-brand-600 font-bold mt-1">[{activeLocation}] 하자 #{currentIdx}</span>
          </div>
          <button onClick={() => resetForm(true)} className="text-gray-400 hover:text-gray-600 p-2"><X size={24} /></button>
        </div>

        <input type="file" ref={cameraInputFarRef} onChange={(e) => handlePhotoAdd(e, 'FAR')} accept="image/*" capture="environment" className="hidden" />
        <input type="file" ref={galleryInputFarRef} onChange={(e) => handlePhotoAdd(e, 'FAR')} accept="image/*" className="hidden" />
        <input type="file" ref={cameraInputNearRef} onChange={(e) => handlePhotoAdd(e, 'NEAR')} accept="image/*" capture="environment" className="hidden" />
        <input type="file" ref={galleryInputNearRef} onChange={(e) => handlePhotoAdd(e, 'NEAR')} accept="image/*" className="hidden" />

        <div className="space-y-6">
           <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">원거리 사진 ({tempFarPhotos.length}/{MAX_FAR})</label>
              <div className="grid grid-cols-3 gap-2">
                {tempFarPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-gray-50">
                    <img src={p.url} className="w-full h-full object-cover" onClick={() => setViewerState({isOpen: true, photos: tempFarPhotos.map(x => x.url), index: i})} />
                    <button onClick={() => removePhoto('FAR', i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-sm"><X size={10} /></button>
                  </div>
                ))}
                {tempFarPhotos.length < MAX_FAR && (
                  <button onClick={() => triggerFileInput(cameraInputFarRef)} className="aspect-square rounded-lg flex flex-col items-center justify-center bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 transition shadow-sm active:scale-95">
                      <Camera size={24} className="mb-1"/>
                      <span className="text-[10px] font-bold">사진 촬영</span>
                  </button>
                )}
                {tempFarPhotos.length < MAX_FAR && (
                  <button onClick={() => triggerFileInput(galleryInputFarRef)} className="aspect-square rounded-lg flex flex-col items-center justify-center bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition active:scale-95">
                      <ImageIcon size={24} className="mb-1"/>
                      <span className="text-[10px] font-bold">앨범</span>
                  </button>
                )}
              </div>
           </div>

           <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">근거리 사진 ({tempNearPhotos.length}/{MAX_NEAR})</label>
              <div className="grid grid-cols-3 gap-2">
                {tempNearPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-gray-50">
                    <img src={p.url} className="w-full h-full object-cover" onClick={() => setViewerState({isOpen: true, photos: tempNearPhotos.map(x => x.url), index: i})} />
                    <button onClick={() => removePhoto('NEAR', i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-sm"><X size={10} /></button>
                  </div>
                ))}
                {tempNearPhotos.length < MAX_NEAR && (
                  <button onClick={() => triggerFileInput(cameraInputNearRef)} className="aspect-square rounded-lg flex flex-col items-center justify-center bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 transition shadow-sm active:scale-95">
                      <Camera size={24} className="mb-1"/>
                      <span className="text-[10px] font-bold">사진 촬영</span>
                  </button>
                )}
                {tempNearPhotos.length < MAX_NEAR && (
                   <button onClick={() => triggerFileInput(galleryInputNearRef)} className="aspect-square rounded-lg flex flex-col items-center justify-center bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition active:scale-95">
                      <ImageIcon size={24} className="mb-1"/>
                      <span className="text-[10px] font-bold">앨범</span>
                  </button>
                )}
              </div>
           </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">하자 내용</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="내용을 입력하세요 (예: 거실 벽지 들뜸)" className="w-full p-4 border rounded-xl h-24 focus:ring-2 focus:ring-brand-500 outline-none resize-none text-sm" />
            
            {matchedStandard && (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs animate-in slide-in-from-top-2 fade-in">
                    <h5 className="font-bold text-yellow-800 flex items-center gap-2 mb-1">
                        <Scale size={16} className="text-yellow-700" />
                        <span className="bg-yellow-600 text-white text-[10px] px-1.5 py-0.5 rounded">관련 기준</span>
                        {matchedStandard.title}
                    </h5>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{matchedStandard.content}</p>
                </div>
            )}
          </div>

          <button onClick={handleSaveDefect} className="w-full py-4 bg-brand-600 text-white font-bold rounded-xl shadow-md">저장하기</button>
        </div>
        <AnimatePresence>
          {viewerState.isOpen && <PhotoViewer photos={viewerState.photos} initialIndex={viewerState.index} onClose={() => setViewerState(p => ({...p, isOpen: false}))} />}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-32 h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><LayoutGrid size={20} className="text-brand-600" /> 구역 선택</h2>
          <div className="flex gap-1">
            <button onClick={() => setShowTeamModal(true)} className="text-[10px] font-bold px-2 py-1 bg-brand-50 text-brand-700 rounded border border-brand-200 flex items-center gap-1 transition-colors hover:bg-brand-100"><Users size={12}/> 협업</button>
            <button onClick={() => setIsReordering(true)} className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isReordering ? 'bg-brand-600 text-white border-brand-600 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
               <ArrowLeftRight size={12}/> 순서
            </button>
            <button 
                onClick={() => {
                    setIsRenaming(!isRenaming);
                    setTargetRenameLoc(null);
                    setNewLocationName('');
                    setIsAddingLocation(false);
                }} 
                className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isRenaming ? 'bg-brand-600 text-white border-brand-600 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
            >
               <PenLine size={12}/> 이름변경
            </button>
            <button 
                onClick={() => {
                    setIsAddingLocation(true);
                    setIsRenaming(false);
                    setTargetRenameLoc(null);
                }} 
                className="text-[10px] text-brand-600 font-bold px-2 py-1 bg-brand-50 rounded border border-brand-100"
            >
                + 추가
            </button>
          </div>
        </div>
        
        {/* Rename Input Panel */}
        {targetRenameLoc && (
           <div className="mb-3 flex gap-2 p-2 bg-brand-50 rounded-lg border border-brand-200 animate-in slide-in-from-top-2">
             <div className="flex-1 flex flex-col">
                 <span className="text-[10px] text-brand-600 font-bold mb-1 ml-1">이름 변경: {targetRenameLoc}</span>
                 <input autoFocus type="text" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-brand-500" />
             </div>
             <button onClick={handleRenameConfirm} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold self-end">확인</button>
             <button onClick={() => setTargetRenameLoc(null)} className="bg-white text-gray-500 border px-3 py-2 rounded-lg text-sm self-end">취소</button>
           </div>
        )}

        {isAddingLocation && (
          <div className="mb-3 flex gap-2 p-2 bg-white rounded-lg border animate-in slide-in-from-top-2">
            <input autoFocus type="text" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} placeholder="구역명 입력" className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none" />
            <button onClick={handleAddLocation} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold">확인</button>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {locations.map(renderLocationItem)}
        </div>
      </div>

      <div className="space-y-4 flex-1">
        {currentLocationDefects.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed rounded-2xl text-gray-400 bg-white/50">등록된 하자가 없습니다.</div>
        ) : (
          currentLocationDefects.map((d, i) => (
            <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col gap-3 active:scale-[0.98] transition-transform">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-[10px] font-bold">{i+1}</span>
                  <p className="font-bold text-gray-800">{d.description}</p>
                </div>
                <div className="flex gap-3 text-gray-400">
                  <button onClick={() => handleStartEdit(d)} className="p-1"><Pencil size={18}/></button>
                  <button onClick={() => handleDeleteDefect(d.id)} className="p-1"><Trash2 size={18}/></button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[...d.farPhotos, ...d.nearPhotos].slice(0, 4).map((p, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border cursor-zoom-in" onClick={() => setViewerState({isOpen: true, photos: getAllPhotoUrls(d), index: idx})}>
                    <img src={getDisplayUrl(p)} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-white/95 backdrop-blur-md border-t z-10 flex gap-3 max-w-md mx-auto">
        <button onClick={onFinish} className="flex-1 bg-gray-800 text-white font-bold py-4 rounded-xl shadow-lg">최종 보고서</button>
        <button onClick={handleStartCreation} className="flex-1 bg-brand-600 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"><Plus size={20}/> {activeLocation} 추가</button>
      </div>

      {isReordering && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col pt-safe h-[100dvh]">
            <div className="p-4 border-b flex justify-between items-center bg-white">
               <h3 className="font-bold text-lg">구역 순서 편집</h3>
               <button onClick={() => setIsReordering(false)} className="bg-brand-600 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-md">완료</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 pb-32">
               <div ref={constraintsRef} className="grid grid-cols-3 gap-3 max-w-md mx-auto relative">
                 {locations.map(loc => (
                    <SortableItem 
                      key={loc} 
                      loc={loc} 
                      active={loc === activeLocation} 
                      draggingLoc={draggingLoc} 
                      constraintsRef={constraintsRef}
                      onDragStart={setDraggingLoc} 
                      onDragEnd={() => setDraggingLoc(null)} 
                      onDragTrigger={handleDrag} 
                    />
                 ))}
               </div>
            </div>
        </div>
      )}

      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowTeamModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl relative border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
                 <Users className="text-brand-600" size={24} />
                 협업 데이터 관리
              </h3>
              <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                작업한 데이터를 파일로 내보내거나,<br/>
                팀원의 데이터를 불러와 하나로 합칠 수 있습니다.
              </p>
            </div>

            {!preparedFile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 mb-2">
                    {/* Export Card */}
                    <button 
                        onClick={handlePrepareData} 
                        disabled={isProcessing} 
                        className="group relative p-4 h-40 rounded-3xl bg-white border-2 border-brand-100 hover:border-brand-500 hover:bg-brand-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md active:scale-95"
                    >
                        <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-brand-100">
                            <Share2 size={24} />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-gray-800 text-sm group-hover:text-brand-700">내보내기</div>
                            <div className="text-[10px] text-gray-400 mt-1 font-medium">내 점검 데이터를<br/>파일로 생성</div>
                        </div>
                    </button>

                    {/* Import Card */}
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isProcessing} 
                        className="group relative p-4 h-40 rounded-3xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md active:scale-95"
                    >
                         <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-indigo-100">
                            <FolderInput size={24} />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-gray-800 text-sm group-hover:text-indigo-700">합치기</div>
                            <div className="text-[10px] text-gray-400 mt-1 font-medium">팀원 파일을 가져와<br/>하나로 병합</div>
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleMergeFileChange} accept=".zip,.json" className="hidden" />
                    </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center animate-in zoom-in-95 duration-300">
                <div className="bg-green-50 rounded-2xl p-6 border border-green-100 mb-6">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                        <FileJson size={32} />
                    </div>
                    <p className="text-green-800 font-bold text-lg mb-1">파일 준비 완료!</p>
                    <p className="text-green-600 text-xs">이제 아래 버튼을 눌러 파일을 저장하고<br/>카카오톡 등으로 팀원에게 공유하세요.</p>
                </div>
                
                <button 
                    onClick={executeDownload} 
                    className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                    <Download size={20} />
                    파일 내보내기
                </button>
                <button onClick={() => setPreparedFile(null)} className="text-sm text-gray-400 hover:text-gray-600 underline decoration-gray-300 underline-offset-4 py-2">
                    뒤로 가기
                </button>
              </div>
            )}

            {isProcessing && (
              <div className="absolute inset-0 bg-white/95 rounded-3xl flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <div className="relative">
                    <RefreshCw className="animate-spin text-brand-600 mb-4" size={40} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-brand-600 rounded-full"></div>
                    </div>
                </div>
                <p className="text-brand-800 font-bold animate-pulse">{processingMsg}</p>
              </div>
            )}
            
            {!isProcessing && !preparedFile && (
              <button onClick={() => setShowTeamModal(false)} className="w-full mt-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition text-sm">
                닫기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptureScreen;

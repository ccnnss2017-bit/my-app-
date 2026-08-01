
import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import InfoForm from './components/InfoForm';
import CaptureScreen from './components/CaptureScreen';
import ArchiveScreen from './components/ArchiveScreen';
import LoginScreen from './components/LoginScreen';
import SnapshotModal from './components/SnapshotModal';
import { AppState, InspectionInfo, DefectItem, Snapshot, PhotoItem } from './types';
import { generatePDF, getMatchingStandard } from './services/pdfService';
import { 
  loadStep, loadInfo, loadDefects, loadLocations, 
  saveStep, saveInfo, saveDefects, saveLocations, clearAllData, saveToArchive, checkAuth, clearAuth, updateAuthTimestamp,
  saveSnapshot
} from './services/storage';
import { ArrowLeft, FileText, Download, MapPin, Loader2, Archive, Copy, CheckCircle, RotateCcw, Wifi, WifiOff, LogOut, History, Image as ImageIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import PhotoViewer from './components/PhotoViewer';

const getLocalISOString = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  // Round to nearest 10 minutes
  const coeff = 1000 * 60 * 10;
  const rounded = new Date(Math.round(now.getTime() / coeff) * coeff);
  const localISOTime = (new Date(rounded.getTime() - offsetMs)).toISOString().slice(0, 16);
  return localISOTime;
};

const INITIAL_INFO: InspectionInfo = {
  apartmentName: '',
  unit: '',
  typeSize: '',
  inspectorName: '',
  phoneNumber: '',
  date: getLocalISOString()
};

// Default categories for 84sqm apartment
const DEFAULT_LOCATIONS = [
  '현관', '현관창고', '공용욕실', '침실3', '침실2', '복도', 
  '펜트리', '거실', '주방', '다용도실', '침실1', '발코니', 
  '실외기실', '대피공간', '드레스룸', '부부욕실', '공기질,라돈'
];

// Helper to extract URL string from PhotoItem
const getPhotoUrl = (item: PhotoItem): string => {
  if (typeof item === 'string') return item;
  return item.url;
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false); // Auth State
  
  const [step, setStep] = useState<AppState['step']>('info');
  // Track the previous step to allow returning from Archive
  const [lastStep, setLastStep] = useState<AppState['step']>('info');
  
  const [info, setInfo] = useState<InspectionInfo>(INITIAL_INFO);
  const [defects, setDefects] = useState<DefectItem[]>([]);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false); // ZIP generation state
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  
  // Network Status State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Photo Viewer State for Preview
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    photos: string[];
    index: number;
  }>({ isOpen: false, photos: [], index: 0 });
  
  // Use a ref to track if initial load is done
  const isLoadedRef = useRef(false);

  // --- REFS FOR AUTO-SAVE (To access latest state inside interval without resetting it) ---
  const infoRef = useRef(info);
  const defectsRef = useRef(defects);
  const locationsRef = useRef(locations);
  const stepRef = useRef(step);

  // Sync Refs
  useEffect(() => { infoRef.current = info; }, [info]);
  useEffect(() => { defectsRef.current = defects; }, [defects]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { stepRef.current = step; }, [step]);

  // Initialize app: Load data from IndexedDB
  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Check Auth (Validation only)
        const hasAuth = checkAuth();
        setIsAuthorized(hasAuth);

        // 2. Load Data (Always load, even if auth fails, so data is ready upon relogin)
        const [savedStep, savedInfo, savedDefects, savedLocations] = await Promise.all([
          loadStep(),
          loadInfo(),
          loadDefects(),
          loadLocations()
        ]);

        if (savedStep) setStep(savedStep);
        if (savedInfo) setInfo(savedInfo);
        if (savedDefects) setDefects(savedDefects);
        if (savedLocations) setLocations(savedLocations);

      } catch (error) {
        console.error("Failed to load saved data", error);
      } finally {
        setIsLoading(false);
        isLoadedRef.current = true;
      }
    };

    initApp();
  }, []);

  // Monitor App Visibility (Background/Foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // When app comes back to foreground
      if (document.visibilityState === 'visible') {
        const isValid = checkAuth();
        // If timed out or session lost, force logout
        if (!isValid) {
          setIsAuthorized(false);
        } else {
          // If valid, just ensure state matches
          setIsAuthorized(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Monitor User Activity to Refresh Session (Prevent timeout while working)
  useEffect(() => {
    if (!isAuthorized) return;

    const handleUserActivity = () => {
      // 1. Check if the session has ALREADY expired based on the last timestamp
      const isValid = checkAuth(); 
      if (!isValid) {
        // Expired: Log out immediately, do not update timestamp
        setIsAuthorized(false);
        clearAuth(); 
        alert("장시간 활동이 없어 보안을 위해 잠금 화면으로 이동합니다.\n작업 내용은 안전하게 저장되어 있습니다.");
      } else {
        // Valid: Extend the session
        updateAuthTimestamp();
      }
    };

    // Periodically check for timeout even without interaction (e.g. looking at screen for 1h 1m)
    const idleCheckInterval = setInterval(() => {
       const isValid = checkAuth();
       if (!isValid) {
          setIsAuthorized(false);
          clearAuth();
          // No alert here to prevent modal stacking if user is away, just switch screen
       }
    }, 60 * 1000); // Check every minute

    // Listen to common interaction events
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    return () => {
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      clearInterval(idleCheckInterval);
    };
  }, [isAuthorized]);

  // Monitor Network Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- AUTO-SAVE SNAPSHOT LOGIC ---
  useEffect(() => {
    if (!isAuthorized) return;

    const snapshotInterval = setInterval(() => {
        if (
            isLoadedRef.current && 
            stepRef.current === 'capture' && 
            defectsRef.current.length > 0
        ) {
            saveSnapshot(infoRef.current, defectsRef.current, locationsRef.current)
                .catch(err => console.error("Auto-save failed", err));
        }
    }, 10 * 60 * 1000); // Exactly 10 minutes

    return () => clearInterval(snapshotInterval);
  }, [isAuthorized]);

  // Prevent accidental back navigation
  useEffect(() => {
    history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Persist state changes
  useEffect(() => {
    if (isLoadedRef.current) saveStep(step);
  }, [step]);

  useEffect(() => {
    if (isLoadedRef.current) saveInfo(info);
  }, [info]);

  useEffect(() => {
    if (isLoadedRef.current) saveDefects(defects);
  }, [defects]);

  useEffect(() => {
    if (isLoadedRef.current) saveLocations(locations);
  }, [locations]);

  const handleInfoSubmit = (data: InspectionInfo) => {
    setInfo(data);
    setStep('capture');
  };

  const handleFinishCapture = () => {
    if (defects.length > 0 && isLoadedRef.current) {
        // UI 차단을 방지하기 위해 await 없이 백그라운드에서 백업 실행
        saveSnapshot(infoRef.current, defectsRef.current, locationsRef.current).catch(e => {
            console.error("최종 보고서 이동 전 백업 실패", e);
        });
    }
    setStep('preview');
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    
    // 안전한 백업 (파일 생성 전 OOM 대비)
    try {
      if (isLoadedRef.current && defects.length > 0) {
          await saveSnapshot(info, defects, locations);
      }
    } catch (e) {
      console.error("PDF 생성 전 스냅샷 저장 실패", e);
    }

    setTimeout(async () => {
      try {
        await generatePDF(info, defects, locations);
      } catch (e) {
        console.error("PDF 생성 중 오류", e);
        alert("PDF 생성 중 오류가 발생했습니다. 메모리가 부족할 수 있습니다. (데이터는 안전하게 백업되었습니다)");
      } finally {
        setIsGenerating(false);
      }
    }, 100);
  };

  const generateReportText = () => {
    const dateStr = new Date(info.date).toLocaleString('ko-KR');

    let text = `[사전점검 리포트 - Double Check]\n\n`;
    text += `■ 현장 정보\n`;
    text += `- 현장명: ${info.apartmentName}\n`;
    text += `- 동/호수: ${info.unit}\n`;
    text += `- 타입: ${info.typeSize}\n`;
    text += `- 고객명: ${info.inspectorName} (${info.phoneNumber})\n`;
    text += `- 점검일: ${dateStr}\n`;
    text += `\n================================\n\n`;
    
    const actualDefects = defects.filter(d => d.location !== '공기질,라돈');
    text += `■ 하자 세부 내역 (총 ${actualDefects.length}건)\n\n`;
    
    // 1. Group by location
    const grouped = defects.reduce((acc, d) => {
      (acc[d.location] = acc[d.location] || []).push(d);
      return acc;
    }, {} as Record<string, DefectItem[]>);
    
    // 2. Get ALL defect locations
    const defectLocations = Object.keys(grouped);

    // 3. Sort logic
    defectLocations.sort((a, b) => {
      const idxA = locations.indexOf(a);
      const idxB = locations.indexOf(b);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    defectLocations.forEach(loc => {
      text += `[${loc}]\n`;
      const locDefects = grouped[loc] as DefectItem[];
      locDefects.forEach((d, i) => {
        text += `${i + 1}. ${d.description}\n`;
      });
      text += '\n';
    });

    return text;
  };

  const handleDownloadPhotos = async () => {
    if (defects.length === 0) {
      alert("다운로드할 사진이 없습니다.");
      return;
    }

    setIsZipping(true);
    
    // 안전한 백업 (파일 생성 전 OOM 대비)
    try {
      if (isLoadedRef.current) {
          await saveSnapshot(info, defects, locations);
      }
    } catch (e) {
      console.error("ZIP 생성 전 스냅샷 저장 실패", e);
    }

    try {
      const zip = new JSZip();
      
      // Sanitize folder name
      const safeUnit = info.unit.replace(/[\/\\]/g, '_').trim();
      const rootFolderName = `${info.apartmentName}_${safeUnit}_현장사진`;
      const rootFolder = zip.folder(rootFolderName);
      
      if (!rootFolder) throw new Error("ZIP 폴더 생성 실패");

      // Add report text file
      const reportText = generateReportText();
      rootFolder.file(`${info.apartmentName}_${safeUnit}_하자내역.txt`, reportText);

      const promises: Promise<void>[] = [];

      // Iterate through defects in the order they were added
      defects.forEach((d, defectIndex) => {
         const safeDesc = d.description.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().substring(0, 15) || '하자';
         const safeLoc = d.location.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || '기타';
         
         // Create or get the location subfolder
         const locationFolder = rootFolder.folder(safeLoc);
         
         const maxPhotos = Math.max(d.farPhotos.length, d.nearPhotos.length);
         let fileOrder = 1;

         const processPhoto = (p: PhotoItem, type: string, orderNum: number) => {
            let blobPromise: Promise<Blob>;
            
            if (typeof p !== 'string' && p.blob) {
                blobPromise = Promise.resolve(p.blob);
            } else {
                const url = getPhotoUrl(p);
                blobPromise = fetch(url).then(r => r.blob());
            }

            const prefix = String(defectIndex + 1).padStart(3, '0');
            const orderStr = String(orderNum).padStart(2, '0');
            const filename = `${prefix}_${safeLoc}_${safeDesc}_${orderStr}_${type}.jpg`;

            promises.push(
              blobPromise.then(blob => ({
                 filename,
                 blob,
                 locationFolder
              }))
            );
         };

         for (let i = 0; i < maxPhotos; i++) {
             if (i < d.farPhotos.length) {
                 processPhoto(d.farPhotos[i], '원거리', fileOrder++);
             }
             if (i < d.nearPhotos.length) {
                 processPhoto(d.nearPhotos[i], '근거리', fileOrder++);
             }
         }
      });

      const filesToAdd = await Promise.all(promises);
      
      // Sort files by filename to ensure they are added to the ZIP in alphabetical order
      // This fixes Android ZIP viewers showing files in insertion (promise resolution) order
      filesToAdd.sort((a, b) => a.filename.localeCompare(b.filename));

      filesToAdd.forEach(({ filename, blob, locationFolder }) => {
          if (locationFolder) {
              locationFolder.file(filename, blob);
          } else {
              rootFolder.file(filename, blob);
          }
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${info.apartmentName}_${safeUnit}_현장사진.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (e) {
      console.error("ZIP Error", e);
      alert("사진 다운로드 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopyText = () => {
    if (defects.length === 0) {
      alert('복사할 하자 내역이 없습니다.');
      return;
    }

    const text = generateReportText();

    navigator.clipboard.writeText(text).then(() => {
      alert('고객 정보와 하자 내역이 모두 복사되었습니다.');
    }).catch(err => {
      console.error('Failed to copy: ', err);
      alert('텍스트 복사에 실패했습니다.');
    });
  };

  const handleCompleteClick = () => {
    setShowFinishModal(true);
  };

  const confirmCompleteAndArchive = async () => {
    setShowFinishModal(false);
    setIsLoading(true);
    
    try {
      // 1. Archive current data
      await saveToArchive(info, defects, locations);
      
      // 2. Clear active data
      await clearAllData();
      localStorage.removeItem('info_form_draft');
      
      // 3. Reset State
      setInfo({ ...INITIAL_INFO, date: getLocalISOString() });
      setDefects([]);
      setLocations(DEFAULT_LOCATIONS);
      setStep('info');
      
      alert('저장이 완료되었습니다. 보관함에서 언제든지 내역을 확인하고 수정할 수 있습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirm('모든 데이터가 초기화됩니다 (보관되지 않음). 처음으로 돌아가시겠습니까?')) {
      setIsLoading(true);
      await clearAllData();
      setStep('info');
      setDefects([]);
      setLocations(DEFAULT_LOCATIONS);
      setInfo(INITIAL_INFO);
      localStorage.removeItem('info_form_draft'); 
      isLoadedRef.current = true;
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm('보안을 위해 앱을 잠그시겠습니까?')) {
      clearAuth();
      setIsAuthorized(false);
    }
  };

  const handleLoadArchive = (archivedInfo: InspectionInfo, archivedDefects: DefectItem[], archivedLocations: string[]) => {
    setInfo(archivedInfo);
    setDefects(archivedDefects);
    setLocations(archivedLocations);
    setStep('preview'); // Go straight to preview to check/download
  };

  const handleRestoreSnapshot = (snapshot: Snapshot) => {
     setInfo(snapshot.info);
     setDefects(snapshot.defects);
     setLocations(snapshot.locations);
     setShowSnapshotModal(false);
     setStep('capture'); // Go to capture screen to continue work
  };
  
  const openPhotoViewer = (photos: string[], index: number) => {
    setViewerState({
      isOpen: true,
      photos,
      index
    });
  };

  // Group defects by location for preview
  const groupedDefects = defects.reduce((acc, defect) => {
    (acc[defect.location] = acc[defect.location] || []).push(defect);
    return acc;
  }, {} as Record<string, DefectItem[]>);

  // FIX: Also ensure preview uses all defect locations, sorted by preference
  const activeLocationsInPreview = Object.keys(groupedDefects).sort((a, b) => {
      const idxA = locations.indexOf(a);
      const idxB = locations.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 size={40} className="animate-spin text-brand-600 mb-4" />
        <p>데이터 처리 중...</p>
      </div>
    );
  }

  // SHOW LOGIN SCREEN IF NOT AUTHORIZED
  if (!isAuthorized) {
    return <LoginScreen onSuccess={() => setIsAuthorized(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-safe relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-gray-800 text-white text-xs py-2 px-4 text-center flex items-center justify-center gap-2 animate-in slide-in-from-top">
            <WifiOff size={14} className="text-red-400" />
            <span>오프라인 모드: 인터넷이 없어도 작성 내용은 기기에 안전하게 저장됩니다.</span>
          </div>
        )}
        
        <div className="px-4 py-3 max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'info' && step !== 'archive' && (
              <button 
                onClick={() => setStep(step === 'preview' ? 'capture' : 'info')}
                className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-600"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <FileText className="text-brand-600" size={24} />
              Double Check
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {step === 'capture' && defects.length > 0 && (
               <button onClick={handleReset} className="text-xs text-red-500 font-medium px-2 py-1 rounded hover:bg-red-50">
                 초기화
               </button>
            )}
            {step === 'info' && (
               <button onClick={handleLogout} className="text-gray-400 p-2 hover:bg-gray-100 rounded-full" title="잠금(로그아웃)">
                 <LogOut size={20}/>
               </button>
            )}
            {step !== 'archive' && (
              <>
                <button 
                    onClick={() => setShowSnapshotModal(true)}
                    className="text-gray-600 p-2 hover:bg-gray-100 rounded-full"
                    title="임시 보관함 (자동저장)"
                >
                    <History size={22} />
                </button>
                <button 
                    onClick={() => {
                    setLastStep(step);
                    setStep('archive');
                    }}
                    className="text-gray-600 p-2 hover:bg-gray-100 rounded-full"
                    title="보관함"
                >
                    <Archive size={22} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {step === 'info' && (
          <InfoForm initialData={info} onSubmit={handleInfoSubmit} />
        )}

        {step === 'capture' && (
          <CaptureScreen 
            defects={defects} 
            setDefects={setDefects}
            locations={locations}
            setLocations={setLocations}
            onFinish={handleFinishCapture} 
            onDefectSaved={async () => {
              if (isLoadedRef.current) {
                  try {
                      await saveSnapshot(infoRef.current, defectsRef.current, locationsRef.current);
                  } catch (e) {
                      console.error("하자 등록 시 자동 백업 실패", e);
                  }
              }
            }}
          />
        )}
        
        {step === 'archive' && (
          <ArchiveScreen 
            onLoad={handleLoadArchive}
            onGoBack={() => setStep(lastStep)}
            onGoHome={() => setStep('info')}
          />
        )}

        {step === 'preview' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden pb-44">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">보고서 미리보기</h2>
                <p className="text-sm text-gray-500">내용을 확인하고 저장하세요.</p>
              </div>
              <button
                onClick={handleCopyText}
                className="text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 transition"
              >
                <Copy size={14} />
                텍스트 복사
              </button>
            </div>

            <div className="p-6 bg-gray-50 text-sm space-y-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-3 border-b pb-2">기본 정보</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <span className="text-gray-500">현장명</span> <span className="font-medium text-right">{info.apartmentName}</span>
                  <span className="text-gray-500">동/호수</span> <span className="font-medium text-right">{info.unit}</span>
                  <span className="text-gray-500">타입</span> <span className="font-medium text-right">{info.typeSize}</span>
                  <span className="text-gray-500">고객명</span> <span className="font-medium text-right">{info.inspectorName}</span>
                  <span className="text-gray-500">일시</span> <span className="font-medium text-right">{new Date(info.date).toLocaleString('ko-KR')}</span>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-gray-800 ml-1 text-lg">하자 내역 (총 {defects.filter(d => d.location !== '공기질,라돈').length}건)</h3>
                
                {activeLocationsInPreview.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">등록된 하자가 없습니다.</p>
                ) : (
                  activeLocationsInPreview.map((loc) => (
                    <div key={loc} className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
                        <MapPin size={16} className="text-brand-600" />
                        <h4 className="font-bold text-gray-800 text-base">{loc}</h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{groupedDefects[loc].length}건</span>
                      </div>
                      
                      {groupedDefects[loc].map((d, i) => {
                        const standard = getMatchingStandard(d.description);
                        // Map PhotoItems to URLs for the viewer
                        const allPhotos = [...d.farPhotos, ...d.nearPhotos].map(getPhotoUrl);

                        return (
                          <div key={d.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                              <span 
                                className="flex-shrink-0 w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: 'rgb(0, 15, 85)' }}
                              >
                                {i + 1}
                              </span>
                              <p className="font-bold text-gray-800 line-clamp-1 flex-1">{d.description}</p>
                            </div>
                            
                            <div className="grid grid-cols-5 gap-1 mb-3">
                              {d.farPhotos.map((p, idx) => (
                                <div key={`far-${idx}`} className="aspect-square bg-gray-100 rounded overflow-hidden relative border border-green-200 cursor-zoom-in" onClick={() => openPhotoViewer(allPhotos, idx)}>
                                  <img src={getPhotoUrl(p)} className="w-full h-full object-cover" />
                                  <div className="absolute bottom-0 left-0 right-0 bg-green-500/80 h-1.5"></div>
                                </div>
                              ))}
                              {d.nearPhotos.map((p, idx) => (
                                <div key={`near-${idx}`} className="aspect-square bg-gray-100 rounded overflow-hidden relative border border-blue-200 cursor-zoom-in" onClick={() => openPhotoViewer(allPhotos, d.farPhotos.length + idx)}>
                                  <img src={getPhotoUrl(p)} className="w-full h-full object-cover" />
                                  <div className="absolute bottom-0 left-0 right-0 bg-blue-500/80 h-1.5"></div>
                                </div>
                              ))}
                            </div>

                            {standard && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs">
                                <h5 className="font-bold text-yellow-800 flex items-center gap-2 mb-1">
                                  <span className="bg-yellow-600 text-white text-[10px] px-1.5 py-0.5 rounded">관련 기준</span>
                                  {standard.title}
                                </h5>
                                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{standard.content}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-white/90 backdrop-blur-md border-t border-gray-200 z-10 space-y-2">
              <div className="flex gap-2 w-full max-w-md mx-auto">
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGenerating || isZipping}
                    className="flex-[2] bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-70 disabled:cursor-wait"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        PDF 생성 중...
                      </>
                    ) : (
                      <>
                        <Download size={20} />
                        PDF 다운로드
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadPhotos}
                    disabled={isGenerating || isZipping}
                    className="flex-1 bg-gray-700 hover:bg-gray-800 text-white font-bold py-3.5 px-2 rounded-xl shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-70 disabled:cursor-wait"
                  >
                      {isZipping ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                      <span className="text-sm">사진 전체</span>
                  </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                 <button
                  onClick={handleCompleteClick}
                  className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <CheckCircle size={18} />
                  점검 완료 및 보관
                </button>
                <button
                  onClick={() => setStep('capture')}
                  className="bg-white border border-gray-300 text-gray-700 font-bold py-3 px-4 rounded-xl hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <RotateCcw size={18} />
                  수정하기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fullscreen Photo Viewer for Preview Mode */}
      <AnimatePresence>
        {viewerState.isOpen && (
          <PhotoViewer 
            photos={viewerState.photos}
            initialIndex={viewerState.index}
            onClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
          />
        )}
      </AnimatePresence>

      {/* Snapshot Modal (Temp Archive) */}
      {showSnapshotModal && (
        <SnapshotModal 
            onClose={() => setShowSnapshotModal(false)} 
            onRestore={handleRestoreSnapshot}
        />
      )}

      {/* Confirmation Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-500"></div>
            
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-brand-100 p-3 rounded-full text-brand-600 flex-shrink-0">
                <CheckCircle size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">점검을 완료하시겠습니까?</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  작성하신 점검 자료를 보관함에 안전하게 저장하고 초기 화면으로 돌아갑니다.
                </p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-3 mb-6 text-xs text-gray-600 border border-gray-100">
               <ul className="space-y-1 list-disc list-inside">
                 <li>저장된 자료는 <b>보관함</b>에서 다시 불러올 수 있습니다.</li>
                 <li>아직 작성이 끝나지 않았다면 <b>취소</b>를 눌러주세요.</li>
               </ul>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmCompleteAndArchive}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-sm"
              >
                네, 점검을 완료했습니다
                <span className="text-[10px] font-normal bg-brand-700/50 px-1.5 py-0.5 rounded ml-1">저장 및 종료</span>
              </button>
              <button 
                onClick={() => setShowFinishModal(false)}
                className="w-full py-3.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition"
              >
                아니요, 더 작성할게요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

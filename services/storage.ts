
import JSZip from 'jszip';
import { get, set, del, clear } from 'idb-keyval';
import { DefectItem, InspectionInfo, AppState, CompletedInspection, Snapshot, PhotoItem } from '../types';

const KEYS = {
  STEP: 'app_step',
  INFO: 'app_info',
  DEFECTS: 'app_defects',
  LOCATIONS: 'app_locations',
  DRAFT: 'app_draft',
  ARCHIVE: 'app_archive',
  SNAPSHOTS: 'app_snapshots',
  AUTH_TIMESTAMP: 'app_auth_last_active',
  DEFAULT_LOGO: 'app_default_company_logo' // NEW
};

const SESSION_KEY = 'app_session_active';
const AUTH_TIMEOUT = 60 * 60 * 1000; 

// --- Auth Helpers ---
export const saveAuth = () => {
  sessionStorage.setItem(SESSION_KEY, 'true');
  localStorage.setItem(KEYS.AUTH_TIMESTAMP, Date.now().toString());
};

export const checkAuth = (): boolean => {
  const lastActiveStr = localStorage.getItem(KEYS.AUTH_TIMESTAMP);
  if (!lastActiveStr) return false; 

  const lastActive = parseInt(lastActiveStr, 10);
  const now = Date.now();

  if (now - lastActive > AUTH_TIMEOUT) {
    clearAuth();
    return false;
  }
  
  if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, 'true');
  }
  return true;
};

export const updateAuthTimestamp = () => {
  localStorage.setItem(KEYS.AUTH_TIMESTAMP, Date.now().toString());
};

export const clearAuth = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(KEYS.AUTH_TIMESTAMP);
};

// --- Basic Data Access ---
export const saveStep = (step: AppState['step']) => set(KEYS.STEP, step);
export const saveInfo = (info: InspectionInfo) => set(KEYS.INFO, info);
export const saveLocations = (locations: string[]) => set(KEYS.LOCATIONS, locations);

export const loadStep = () => get<AppState['step']>(KEYS.STEP);
export const loadInfo = () => get<InspectionInfo>(KEYS.INFO);
export const loadLocations = () => get<string[]>(KEYS.LOCATIONS);

// --- Logo Persistence ---
export const saveDefaultLogo = (logo: string) => set(KEYS.DEFAULT_LOGO, logo);
export const loadDefaultLogo = () => get<string>(KEYS.DEFAULT_LOGO);

// --- Helper Functions for Photo Storage ---
const isBlobLike = (obj: any) => {
  return obj instanceof Blob || (obj && typeof obj === 'object' && typeof obj.size === 'number' && typeof obj.type === 'string' && typeof obj.slice === 'function');
};

const toStoragePhotos = async (photos: any[]) => {
  return Promise.all(photos.map(async (p) => {
    if (isBlobLike(p)) return p;
    if (p && typeof p === 'object' && 'blob' in p && isBlobLike(p.blob)) {
      return p.blob;
    }
    if (typeof p === 'string' && p.startsWith('blob:')) {
      try {
        const res = await fetch(p);
        return await res.blob();
      } catch (e) {
        console.error("Failed to fetch blob for save", e);
        return new Blob(['error'], { type: 'image/jpeg' });
      }
    }
    return p;
  }));
};

const fromStoragePhotos = (photos: any[]) => {
  return (photos || []).map((item: any) => {
    if (isBlobLike(item)) {
      return { url: URL.createObjectURL(item), blob: item };
    } else if (item && typeof item === 'object' && isBlobLike(item.blob)) {
      return { 
        url: URL.createObjectURL(item.blob), 
        blob: item.blob
      };
    }
    return item;
  });
};

// --- Handle Defects with Blobs ---
// 직접 Blob 배열을 받도록 수정하여 fetch(url) 의존성 제거
export const saveDefects = async (defects: DefectItem[]) => {
  const defectsWithBlobs = await Promise.all(
    defects.map(async (d) => {
      return {
        ...d,
        farPhotos: await toStoragePhotos(d.farPhotos),
        nearPhotos: await toStoragePhotos(d.nearPhotos)
      };
    })
  );
  await set(KEYS.DEFECTS, defectsWithBlobs);
};

export const loadDefects = async (): Promise<DefectItem[]> => {
  const saved = await get<any[]>(KEYS.DEFECTS);
  if (!saved) return [];
  // 로드 시 다시 { url, blob } 구조로 복원하여 앱 내에서 Blob 참조 유지
  return saved.map((d) => ({
    ...d,
    farPhotos: fromStoragePhotos(d.farPhotos),
    nearPhotos: fromStoragePhotos(d.nearPhotos)
  }));
};

// --- Draft Handling ---
export const saveDraft = async (data: {
  location: string;
  farPhotos: any[]; 
  nearPhotos: any[]; 
  description: string;
  editingId: string | null;
}) => {
  const farBlobs = await toStoragePhotos(data.farPhotos);
  const nearBlobs = await toStoragePhotos(data.nearPhotos);
  
  await set(KEYS.DRAFT, { 
    ...data, 
    farPhotos: farBlobs, 
    nearPhotos: nearBlobs 
  });
};

export const loadDraft = async () => {
  const draft = await get<any>(KEYS.DRAFT);
  if (!draft) return null;
  return {
    ...draft,
    farPhotos: fromStoragePhotos(draft.farPhotos),
    nearPhotos: fromStoragePhotos(draft.nearPhotos)
  };
};

export const clearDraft = () => del(KEYS.DRAFT);

export const clearAllData = async () => {
  await del(KEYS.STEP);
  await del(KEYS.INFO);
  await del(KEYS.DEFECTS);
  await del(KEYS.LOCATIONS);
  await del(KEYS.DRAFT);
};

// --- SNAPSHOTS (Temp Archive) ---
const MAX_SNAPSHOTS = 20; 

export const saveSnapshot = async (info: InspectionInfo, defects: DefectItem[], locations: string[]) => {
  try {
    let snapshots = await get<any[]>(KEYS.SNAPSHOTS) || [];
    
    // defects가 이미 PhotoItem[] 형태일 수 있음. 저장용(Blob[])으로 변환 필요
    const defectsWithBlobs = await Promise.all(
      defects.map(async (d) => {
         return {
            ...d,
            farPhotos: await toStoragePhotos(d.farPhotos),
            nearPhotos: await toStoragePhotos(d.nearPhotos)
         };
      })
    );

    const newSnapshot = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      info,
      defects: defectsWithBlobs,
      locations
    };

    snapshots = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    await set(KEYS.SNAPSHOTS, snapshots);
  } catch (e) {
    console.error("Failed to save snapshot", e);
  }
};

export const loadSnapshots = async (): Promise<Snapshot[]> => {
  const saved = await get<any[]>(KEYS.SNAPSHOTS);
  if (!saved) return [];
  
  return saved.map(s => ({
    ...s,
    defects: s.defects.map((d: any) => ({
      ...d,
      farPhotos: fromStoragePhotos(d.farPhotos),
      nearPhotos: fromStoragePhotos(d.nearPhotos)
    }))
  }));
};

export const deleteSnapshot = async (id: string) => {
  const snapshots = await get<Snapshot[]>(KEYS.SNAPSHOTS) || [];
  const newSnapshots = snapshots.filter(s => s.id !== id);
  await set(KEYS.SNAPSHOTS, newSnapshots);
  return newSnapshots;
};

// --- Archive Handling ---
const getDataKey = (id: string) => `archive_data_${id}`;

export const saveToArchive = async (info: InspectionInfo, defects: DefectItem[], locations: string[]) => {
  const id = Date.now().toString();
  const dataKey = getDataKey(id);

  const defectsWithBlobs = await Promise.all(
    defects.map(async (d) => {
         return {
            ...d,
            farPhotos: await toStoragePhotos(d.farPhotos),
            nearPhotos: await toStoragePhotos(d.nearPhotos)
         };
    })
  );

  await set(dataKey, { defects: defectsWithBlobs, locations });

  const indexItem: CompletedInspection = {
    id,
    info,
    defects: [], 
    locations: [], 
    savedAt: Date.now(),
    defectCount: defects.length
  };

  let currentArchive = await get<CompletedInspection[]>(KEYS.ARCHIVE);
  if (!Array.isArray(currentArchive)) currentArchive = [];
  await set(KEYS.ARCHIVE, [indexItem, ...currentArchive]);
  
  // NOTE: We do not clear the default logo here, as it is a global setting.
};

export const loadArchive = async (): Promise<CompletedInspection[]> => {
  const archive = await get<CompletedInspection[]>(KEYS.ARCHIVE);
  return Array.isArray(archive) ? archive : [];
};

export const loadArchivedItemDetail = async (id: string) => {
  const dataKey = getDataKey(id);
  const data = await get<any>(dataKey);
  
  if (data) {
     const defects = data.defects.map((d: any) => ({
        ...d,
        farPhotos: fromStoragePhotos(d.farPhotos),
        nearPhotos: fromStoragePhotos(d.nearPhotos)
     }));
     return { defects, locations: data.locations };
  }
  return null;
};

export const restoreArchivedItemLegacy = (item: any): { defects: DefectItem[] } => {
  if (!item || !item.defects) return { defects: [] };
  const restoredDefects = item.defects.map((d: any) => ({
    ...d,
    farPhotos: fromStoragePhotos(d.farPhotos || []),
    nearPhotos: fromStoragePhotos(d.nearPhotos || [])
  }));
  return { defects: restoredDefects };
};

export const deleteFromArchive = async (id: string) => {
  const currentArchive = await get<CompletedInspection[]>(KEYS.ARCHIVE);
  if (!currentArchive) return [];

  const newArchive = currentArchive.filter(item => item.id !== id);
  await set(KEYS.ARCHIVE, newArchive);
  await del(getDataKey(id));
  return newArchive;
};

// --- TEAM COLLABORATION / EXPORT ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = async (base64: string): Promise<Blob> => {
  try {
      const res = await fetch(base64);
      return await res.blob();
  } catch (e) {
      console.error("Error converting base64 to blob", e);
      throw new Error("이미지 변환 실패");
  }
};

const generateUniqueId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
};

export const exportActiveDataToDataFile = async (info: InspectionInfo, defects: DefectItem[]): Promise<Blob> => {
  try {
      const zip = new JSZip();
      const photosFolder = zip.folder('photos');
      if (!photosFolder) throw new Error("ZIP 폴더 생성 실패");

      let photoCounter = 0;

      const serializableDefects = await Promise.all(defects.map(async (d) => {
        const processPhotos = async (photos: PhotoItem[], prefix: string) => {
            return Promise.all(photos.map(async p => {
                let blob: Blob | null = null;

                if (p instanceof Blob) {
                    blob = p;
                } else if (typeof p === 'object' && 'blob' in p) {
                    blob = p.blob;
                } else if (typeof p === 'string') {
                    blob = await (await fetch(p)).blob();
                }

                if (!blob) return null;

                photoCounter++;
                const blobFilename = `${prefix}_${photoCounter}.jpg`;
                photosFolder.file(blobFilename, blob);

                return {
                    blobFilename
                };
            }));
        };

        return {
            ...d,
            farPhotos: (await processPhotos(d.farPhotos, 'far')).filter(Boolean),
            nearPhotos: (await processPhotos(d.nearPhotos, 'near')).filter(Boolean)
        };
      }));

      const data = {
        version: '3.0',
        type: 'DOUBLECHECK_TEAM_DATA',
        info,
        defects: serializableDefects,
        exportedAt: Date.now()
      };

      zip.file('data.json', JSON.stringify(data));

      return await zip.generateAsync({ type: 'blob' });
  } catch (e) {
      console.error("Export Error:", e);
      throw new Error("데이터 내보내기 중 오류가 발생했습니다.");
  }
};

export const mergeActiveDataFromFile = async (file: File): Promise<{ mergedDefects: DefectItem[], newLocations: string[] }> => {
  try {
      let parsed: any;
      let zip: JSZip | null = null;

      if (file.name.endsWith('.zip')) {
          zip = await JSZip.loadAsync(file);
          const jsonFile = zip.file('data.json');
          if (!jsonFile) throw new Error("유효하지 않은 데이터 파일입니다.");
          const text = await jsonFile.async('text');
          parsed = JSON.parse(text);
      } else {
          const text = await file.text();
          parsed = JSON.parse(text);
      }

      if (parsed.type !== 'DOUBLECHECK_TEAM_DATA') {
        throw new Error("이 앱에서 생성된 데이터 파일이 아닙니다.");
      }

      const importedDefectsRaw = parsed.defects || [];
      const newLocations: string[] = [];

      const restoredDefects = await Promise.all(importedDefectsRaw.map(async (d: any) => {
         const newId = generateUniqueId();
         
         const processPhotos = async (photos: any[]) => {
             return Promise.all((photos || []).map(async (item: any) => {
                 if (zip && item.blobFilename) {
                     const blobFile = zip.file(`photos/${item.blobFilename}`);
                     const blob = blobFile ? await blobFile.async('blob') : null;
                     
                     if (blob) {
                         return { url: URL.createObjectURL(blob), blob };
                     }
                 } else if (typeof item === 'string') {
                     const blob = await base64ToBlob(item);
                     return { url: URL.createObjectURL(blob), blob };
                 } else if (item && item.blob) {
                     const blob = typeof item.blob === 'string' ? await base64ToBlob(item.blob) : item.blob;
                     return { url: URL.createObjectURL(blob), blob };
                 }
                 return null;
             }));
         };

         const farPhotos = await processPhotos(d.farPhotos);
         const nearPhotos = await processPhotos(d.nearPhotos);

         const validFarPhotos = farPhotos.filter(Boolean);
         const validNearPhotos = nearPhotos.filter(Boolean);

         if (d.location) newLocations.push(d.location);

         return {
             ...d,
             id: newId,
             farPhotos: validFarPhotos,
             nearPhotos: validNearPhotos,
             timestamp: d.timestamp || Date.now()
         };
      }));

      return {
          mergedDefects: restoredDefects,
          newLocations: [...new Set(newLocations)]
      };
  } catch (err: any) {
      console.error("Merge Error:", err);
      throw new Error(err.message || "데이터 합치기에 실패했습니다.");
  }
};

export const exportArchiveData = async (selectedIds?: string[]) => {
  let archive = await loadArchive();
  if (selectedIds && selectedIds.length > 0) {
      archive = archive.filter(item => selectedIds.includes(item.id));
  }

  const fullArchive = await Promise.all(archive.map(async (item: any) => {
    const dataKey = getDataKey(item.id);
    const rawData = await get<any>(dataKey);

    let defectsToProcess = rawData?.defects || item.defects || [];
    let locationsToProcess = rawData?.locations || item.locations || [];

    const serializableDefects = await Promise.all(defectsToProcess.map(async (d: any) => {
      const processPhotos = async (photos: any[]) => {
          return Promise.all(photos.map(async (p: any) => {
              try {
                  if (p instanceof Blob) return await blobToBase64(p);
                  // {url, blob} object case
                  if (p && typeof p === 'object' && 'blob' in p) return await blobToBase64(p.blob);
                  
                  if (typeof p === 'string' && p.startsWith('blob:')) {
                      const res = await fetch(p);
                      return await blobToBase64(await res.blob());
                  }
                  if (typeof p === 'string' && p.startsWith('data:')) return p;
                  return null;
              } catch (e) { return null; }
          }));
      };

      return {
          ...d,
          farPhotos: (await processPhotos(d.farPhotos)).filter(Boolean),
          nearPhotos: (await processPhotos(d.nearPhotos)).filter(Boolean)
      };
    }));

    return { 
        ...item, 
        defects: serializableDefects,
        locations: locationsToProcess 
    };
  }));

  return JSON.stringify(fullArchive);
};

export const importArchiveData = async (jsonString: string) => {
  const parsedArchive = JSON.parse(jsonString);
  if (!Array.isArray(parsedArchive)) throw new Error("데이터 형식이 올바르지 않습니다.");
  
  for (const item of parsedArchive) {
    const newId = generateUniqueId();
    const restoredDefects = await Promise.all((item.defects || []).map(async (d: any) => ({
      ...d,
      farPhotos: await Promise.all((d.farPhotos || []).map(async (b64: string) => b64 ? base64ToBlob(b64) : null)),
      nearPhotos: await Promise.all((d.nearPhotos || []).map(async (b64: string) => b64 ? base64ToBlob(b64) : null))
    })));

    const cleanedDefects = restoredDefects.map(d => ({
        ...d,
        farPhotos: d.farPhotos.filter((p: any) => p !== null),
        nearPhotos: d.nearPhotos.filter((p: any) => p !== null)
    }));

    await set(getDataKey(newId), { defects: cleanedDefects, locations: item.locations || [] });

    const indexItem: CompletedInspection = {
        id: newId,
        info: item.info,
        defects: [],
        locations: [], 
        savedAt: item.savedAt || Date.now(),
        defectCount: cleanedDefects.length
    };

    let currentArchive = await get<CompletedInspection[]>(KEYS.ARCHIVE);
    if (!Array.isArray(currentArchive)) currentArchive = [];
    await set(KEYS.ARCHIVE, [indexItem, ...currentArchive]);
  }
  return loadArchive();
};


export interface InspectionInfo {
  apartmentName: string;
  unit: string; // Dong/Ho
  typeSize: string; // Pyung/Type
  inspectorName: string;
  phoneNumber: string;
  date: string;
}

export type PhotoItem = string | { url: string; blob: Blob; originalBlob?: Blob; isOriginal?: boolean };

export interface DefectItem {
  id: string;
  location: string; // Zone/Room name (e.g., Living Room, Kitchen)
  farPhotos: PhotoItem[]; // Array of URLs or Photo Objects
  nearPhotos: PhotoItem[]; // Array of URLs or Photo Objects
  description: string;
  timestamp: number;
}

export interface CompletedInspection {
  id: string;
  info: InspectionInfo;
  defects: DefectItem[];
  locations: string[];
  savedAt: number;
  defectCount?: number; // Added for lightweight indexing
}

export interface Snapshot {
  id: string;
  timestamp: number;
  info: InspectionInfo;
  defects: DefectItem[];
  locations: string[];
}

export interface AppState {
  step: 'info' | 'capture' | 'preview' | 'archive'; // Added 'archive' step
  info: InspectionInfo;
  defects: DefectItem[];
  locations: string[]; // List of available categories
}

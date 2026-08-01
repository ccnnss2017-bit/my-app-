import React, { useEffect, useState } from 'react';
import { loadSnapshots, deleteSnapshot } from '../services/storage';
import { Snapshot } from '../types';
import { History, Clock, Trash2, ArrowRight, RotateCcw } from 'lucide-react';

interface SnapshotModalProps {
  onClose: () => void;
  onRestore: (snapshot: Snapshot) => void;
}

const SnapshotModal: React.FC<SnapshotModalProps> = ({ onClose, onRestore }) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSnapshots().then(data => {
      setSnapshots(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 임시 저장본을 삭제하시겠습니까?')) {
        const newData = await deleteSnapshot(id);
        setSnapshots(newData);
    }
  };

  const handleRestore = (snapshot: Snapshot) => {
    if (confirm('이 시점으로 복원하시겠습니까?\n현재 작성 중인 내용은 덮어씌워집니다.')) {
        onRestore(snapshot);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl relative max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 text-brand-700">
            <div className="bg-brand-100 p-2 rounded-full">
                <History size={24} />
            </div>
            <div>
                <h3 className="text-lg font-bold text-gray-900">임시 보관함 (자동저장)</h3>
                <p className="text-xs text-gray-500">10분마다 자동으로 상태가 저장됩니다.</p>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loading ? (
                <div className="text-center py-8 text-gray-400">로딩 중...</div>
            ) : snapshots.length === 0 ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                    저장된 내역이 없습니다.
                </div>
            ) : (
                snapshots.map((snap) => (
                    <div 
                        key={snap.id} 
                        className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm active:bg-gray-50 transition cursor-pointer group"
                        onClick={() => handleRestore(snap)}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 text-brand-600 font-bold mb-1">
                                <Clock size={14} />
                                {new Date(snap.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                            <button 
                                onClick={(e) => handleDelete(snap.id, e)}
                                className="text-gray-300 hover:text-red-500 p-1 rounded-full"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <div className="text-sm text-gray-700 font-medium">
                            {snap.info.apartmentName} {snap.info.unit}
                        </div>
                        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                            <span>하자 {snap.defects.length}건 · 구역 {snap.locations.length}개</span>
                            <span className="flex items-center text-brand-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                복원 <RotateCcw size={12} className="ml-1"/>
                            </span>
                        </div>
                    </div>
                ))
            )}
        </div>

        <button 
            onClick={onClose} 
            className="w-full mt-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
        >
            닫기
        </button>
      </div>
    </div>
  );
};

export default SnapshotModal;
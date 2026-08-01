
import React, { useState, useEffect } from 'react';
import { InspectionInfo } from '../types';
import { ChevronRight, Building, User, Calendar, Phone, Home, Layers } from 'lucide-react';

interface InfoFormProps {
  initialData: InspectionInfo;
  onSubmit: (data: InspectionInfo) => void;
}

const InfoForm: React.FC<InfoFormProps> = ({ initialData, onSubmit }) => {
  const [formData, setFormData] = useState<InspectionInfo>(initialData);

  // Load draft text data
  useEffect(() => {
    const isInitialEmpty = !initialData.apartmentName && !initialData.inspectorName;
    if (isInitialEmpty) {
      const draft = localStorage.getItem('info_form_draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // Don't overwrite logo if it was loaded from storage above, unless draft has one
          setFormData(prev => ({
              ...parsed
          }));
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }
    }
  }, [initialData]);

  // Save draft to localStorage on change (excluding logo to avoid quota size issues in localStorage text, though IDB is used for logo)
  useEffect(() => {
    localStorage.setItem('info_form_draft', JSON.stringify(formData));
  }, [formData]);

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 4) return cleaned;
    if (cleaned.length < 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    if (cleaned.length < 11) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'phoneNumber') {
      const formatted = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, [name]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Helper to extract parts safely for Unit (Dong/Ho)
  const getUnitParts = (str: string) => {
    // Expected format: "101동 / 1004호"
    if (str && str.includes('동')) {
      const parts = str.split('동');
      const d = parts[0].trim();
      const h = parts[1] ? parts[1].replace('/', '').replace('호', '').trim() : '';
      return { d, h };
    }
    // Fallback if data format doesn't match
    return { d: str, h: '' };
  };

  // Extract pure value from "84 타입 / 평" format
  const getTypeVal = (str: string) => {
    if (!str) return '';
    // If user has old format data "84타입 / 34평", just show it as is or try to extract
    // But for the new requirement, we assume standard format ends with " 타입 / 평"
    return str.replace(' 타입 / 평', '');
  };

  const { d: dong, h: ho } = getUnitParts(formData.unit);
  const typeVal = getTypeVal(formData.typeSize);

  const handleUnitChange = (part: 'first' | 'second', value: string) => {
    const newDong = part === 'first' ? value : dong;
    const newHo = part === 'second' ? value : ho;
    // Combine back to standard string
    const combined = newDong || newHo ? `${newDong}동 / ${newHo}호` : '';
    setFormData(prev => ({ ...prev, unit: combined }));
  };

  const handleTypeChange = (value: string) => {
    // Store as "Value 타입 / 평"
    const combined = value ? `${value} 타입 / 평` : '';
    setFormData(prev => ({ ...prev, typeSize: combined }));
  };

  // Date/Time Handling Helpers
  const [datePart, timePart] = formData.date.split('T');
  const [hourPart, minutePart] = (timePart || '09:00').split(':');

  const handleDatePartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setFormData(prev => {
        // preserve existing time or default to current rounded time
        const currentTime = prev.date.split('T')[1] || '09:00';
        return { ...prev, date: `${newDate}T${currentTime}` };
    });
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHour = e.target.value;
    setFormData(prev => {
        const currentDate = prev.date.split('T')[0];
        const currentMinute = (prev.date.split('T')[1] || '00:00').split(':')[1];
        return { ...prev, date: `${currentDate}T${newHour}:${currentMinute}` };
    });
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMinute = e.target.value;
    setFormData(prev => {
        const currentDate = prev.date.split('T')[0];
        const currentHour = (prev.date.split('T')[1] || '00:00').split(':')[0];
        return { ...prev, date: `${currentDate}T${currentHour}:${newMinute}` };
    });
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '10', '20', '30', '40', '50'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict validation for split fields
    const { d: currentDong, h: currentHo } = getUnitParts(formData.unit);
    const currentType = getTypeVal(formData.typeSize);

    // Identify missing fields
    const missingFields: string[] = [];
    if (!formData.apartmentName.trim()) missingFields.push('아파트명');
    if (!currentDong.trim()) missingFields.push('동');
    if (!currentHo.trim()) missingFields.push('호수');
    if (!currentType.trim()) missingFields.push('타입');
    if (!formData.inspectorName.trim()) missingFields.push('고객명');
    if (!formData.phoneNumber.trim()) missingFields.push('전화번호');
    if (!formData.date.trim()) missingFields.push('점검 일시');

    // If there are missing fields, alert user with specific list
    if (missingFields.length > 0) {
      alert(`다음 필수 항목이 입력되지 않았습니다:\n\n• ${missingFields.join('\n• ')}`);
      return;
    }

    onSubmit(formData);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800">현장 정보 입력</h2>
        <p className="text-gray-500 text-sm mt-2">점검 보고서 생성을 위한 기초 정보를 입력해주세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">아파트명 <span className="text-red-500">*</span></label>
          <div className="relative">
            <Building className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              name="apartmentName"
              value={formData.apartmentName}
              onChange={handleChange}
              placeholder="예: 서울 자이, 부산 롯데캐슬"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
            />
          </div>
        </div>

        {/* Split Input for Dong/Ho */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">동 / 호수 <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Home className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={dong}
                onChange={(e) => handleUnitChange('first', e.target.value)}
                placeholder="101"
                className="w-full pl-10 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition text-center"
              />
            </div>
            <span className="text-gray-500 font-bold text-sm whitespace-nowrap">동 /</span>
            <div className="relative flex-1">
              <input
                type="text"
                value={ho}
                onChange={(e) => handleUnitChange('second', e.target.value)}
                placeholder="1004"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition text-center"
              />
            </div>
            <span className="text-gray-500 font-bold text-sm whitespace-nowrap">호</span>
          </div>
        </div>

        {/* Single Input for Type with Suffix */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">타입 <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Layers className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={typeVal}
                onChange={(e) => handleTypeChange(e.target.value)}
                placeholder="84"
                className="w-full pl-10 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition text-center"
              />
            </div>
            <span className="text-gray-500 font-bold text-sm whitespace-nowrap bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-200">
              타입 / 평
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">고객명 <span className="text-red-500">*</span></label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              name="inspectorName"
              value={formData.inspectorName}
              onChange={handleChange}
              placeholder="홍길동"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="tel"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleChange}
              placeholder="010-1234-5678"
              maxLength={13}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">점검 일시 (10분 단위) <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <div className="relative flex-[2]">
                <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="date"
                  value={datePart}
                  onChange={handleDatePartChange}
                  className="w-full pl-10 pr-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                />
            </div>
            <div className="relative flex-1">
                <select
                  value={hourPart}
                  onChange={handleHourChange}
                  className="w-full pl-3 pr-6 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition appearance-none bg-white"
                >
                  {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                </select>
                <div className="absolute right-2 top-3 pointer-events-none text-gray-500 text-[10px]">▼</div>
            </div>
            <div className="relative flex-1">
                <select
                  value={minutePart}
                  onChange={handleMinuteChange}
                  className="w-full pl-3 pr-6 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition appearance-none bg-white"
                >
                  {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                </select>
                <div className="absolute right-2 top-3 pointer-events-none text-gray-500 text-[10px]">▼</div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-xl mt-6 flex items-center justify-center gap-2 transition-colors shadow-md"
        >
          점검 시작하기
          <ChevronRight size={20} />
        </button>
      </form>
    </div>
  );
};

export default InfoForm;

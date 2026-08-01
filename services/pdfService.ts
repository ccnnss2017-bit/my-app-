
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { DefectItem, InspectionInfo, PhotoItem } from '../types';
import { LEGAL_STANDARDS } from './standards';

// 국토교통부 고시 및 건축공사 표준시방서(KCS) 기반 데이터
export { LEGAL_STANDARDS };

export const getMatchingStandard = (text: string) => {
  if (!text) return undefined;
  
  // Normalize text matching
  const target = text.trim();

  // 점수 기반 매칭 시스템
  const candidates = LEGAL_STANDARDS.map(std => {
    let score = 0;
    
    // 주요 카테고리 명사 (가중치 높음)
    const primaryKeywords = [
        // 기존 키워드
        '타일', '도배', '벽지', '마루', '창호', '샷시', '가구', '싱크대', 
        '콘크리트', '균열', '욕실', '변기', '세면대', '방화문', '현관문', 
        '단열', '석고보드', '코킹', '실리콘', '실란트', '누수', '외벽',
        // 추가된 상세 키워드 (가중치 적용을 위해)
        'MDF', 'PB', '부풀음', '마구리', '절단면', '물고임', '구배', '배수', 
        '줄눈', '메지', '유가', '트랩', '긁힘', '찍힘', '들뜸', '박리', '판넬',
        '시트지',
    ];
    
    std.keywords.forEach(keyword => {
       if (target.includes(keyword)) {
         // 1. 기본 점수 부여
         score += 1;

         // 2. 중요 명사가 포함된 경우 가중치 대폭 부여 (+10점)
         if (primaryKeywords.includes(keyword)) {
            score += 10;
         }
       }
    });
    return { ...std, score };
  });

  // 점수가 높은 순으로 정렬
  const matches = candidates.filter(c => c.score > 0);
  matches.sort((a, b) => b.score - a.score);

  return matches.length > 0 ? matches[0] : undefined;
};

// Helper to chunk array for photo rows
const chunk = <T>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

// Helper to get URL string from PhotoItem
const getSrc = (item: PhotoItem): string => {
  if (typeof item === 'string') return item;
  return item.url;
};

// --- HTML Generators for Reusability ---

const contentContainerStyle = "width: 794px; padding: 0 50px; font-family: 'Apple SD Gothic Neo', sans-serif; box-sizing: border-box;";
const innerContentStyle = "background: #fff; border-left: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; padding: 0 20px;";

// Location Header Generator
const getLocationHeaderHtml = (location: string, count: number) => {
  const countHtml = location === '공기질,라돈' 
    ? `<span style="transform: translateY(-8px);">측정 기록</span>`
    : `<span style="transform: translateY(-8px);">${count}건</span>`;

  return `
  <div style="width: 794px; padding: 20px 50px 0px; font-family: 'Apple SD Gothic Neo', sans-serif;">
    <div style="display: flex; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">
       <div style="width: 6px; height: 26px; background: #172447; border-radius: 3px; margin-right: 12px; flex-shrink: 0; transform: translateY(-4px);"></div>
       <div style="font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1; white-space: nowrap; transform: translateY(-17px);">${location}</div>
       <div style="margin-left: 10px; background: #e0f2fe; color: #172447; font-size: 16px; font-weight: 800; padding: 7px 10px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; line-height: 1; display: flex; align-items: center; transform: translateY(-4px);">
         ${countHtml}
       </div>
    </div>
  </div>
  `;
};

// Defect Header
const getDefectHeaderHtml = (index: number, description: string) => `
  <div style="width: 794px; padding: 10px 50px 0px; font-family: 'Apple SD Gothic Neo', sans-serif; box-sizing: border-box;">
      <div style="background: #f1f5f9; padding: 10px 16px; border-radius: 8px 8px 0 0; border: 1px solid #cbd5e1; border-bottom: none;">
          <div style="display: flex; align-items: center;">
            <div style="flex-shrink: 0; background: #1e293b; color: white; width: 25px; height: 25px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; margin-right: 12px;">
                <span style="transform: translateY(-8px);">${index + 1}</span>
            </div>
            <h3 style="font-size: 16px; font-weight: 800; color: #1e293b; margin: 0; line-height: 1; transform: translateY(-7px);">${description}</h3>
          </div>
      </div>
  </div>
`;

const getPhotoSectionHtml = (title: string, colorCode: string, photos: PhotoItem[]) => {
  // Reverted to 2 columns for larger photos
  const rows = chunk(photos, 2);
  let html = `
    <div style="${contentContainerStyle}">
      <div style="${innerContentStyle} padding-top: 10px;">
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${colorCode};"></div>
            <div style="font-size: 13px; font-weight: 800; color: ${colorCode}; transform: translateY(-7px);">${title}</div>
          </div>
      </div>
    </div>
  `;
  
  rows.forEach(row => {
    html += `
      <div style="${contentContainerStyle}">
        <div style="${innerContentStyle} padding-bottom: 6px;">
          <div style="display: flex; gap: 14px;">
            ${row.map(p => `
              <div style="width: 320px; height: 240px; flex-shrink: 0; border-radius: 4px; overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc;">
                  <img src="${getSrc(p)}" style="width: 100%; height: 100%; object-fit: cover;" />
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  });
  return html;
};

const getStandardHtml = (standard: any) => `
  <div style="${contentContainerStyle}">
    <div style="${innerContentStyle} padding-bottom: 8px;">
        <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 10px 14px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <strong style="color: #9a3412; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">관련 법규 및 판정 기준</strong>
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #c2410c; margin-bottom: 2px;">${standard.title}</div>
            <div style="color: #431407; font-size: 11px; line-height: 1.4; white-space: pre-wrap;">${standard.content}</div>
        </div>
    </div>
  </div>
`;

// Reduced Margin Bottom to 0px
const getDividerHtml = () => `
  <div style="${contentContainerStyle} margin-bottom: 0px;">
      <div style="border-top: 1px solid #cbd5e1; height: 1px;"></div>
  </div>
`;

const getRadonLegalHtml = () => `
  <div style="${contentContainerStyle}">
    <div style="${innerContentStyle} padding-bottom: 8px;">
        <div style="background: #f8fafc; border-left: 4px solid #475569; padding: 10px 14px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <strong style="color: #334155; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">관련 법규 및 판정 기준</strong>
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">실내공기질 관리법 제9조제1항 (측정 의무 및 입주예정자 입회)</div>
            <div style="color: #475569; font-size: 11px; line-height: 1.4; white-space: pre-wrap; margin-bottom: 8px;">측정 주체: 100세대 이상 신축 공동주택의 시공자는 시공 완료 후 실내공기질을 측정해야 합니다.
입회 의무 (중요): 측정 시 반드시 환경부령으로 선정된 입주예정자의 입회하에 시공자 본인이 스스로 측정하거나, 공인된 실내공간오염물질 측정대행업체를 통해 측정하도록 법적 의무화가 되었습니다.
제출 및 공고 의무: 공기질 측정 결과는 관할 지자체장(시장·군수·구청장 등)에게 제출해야 하며, 입주 개시 전에 주민들이 잘 볼 수 있는 장소에 의무적으로 공고해야 합니다.</div>

            <div style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">실내공기질 관리법 시행규칙 제6조제1항 (측정현장입회자의 선정 등)</div>
            <div style="color: #475569; font-size: 11px; line-height: 1.4; white-space: pre-wrap; margin-bottom: 8px;">이 조항은 상위법(제9조제1항)에 명시된 '입주예정자 입회'를 현장에서 구체적으로 어떻게 진행할 것인지에 대한 행정적 통보 절차를 규정하고 있습니다. (2024년 신설 규정)
사전 통보 기한: 시공자가 공기질 측정 현장에 참여할 입주예정자(이하 "측정현장입회자")를 선정하고자 할 때는, 반드시 공기질 측정일로부터 20일 전까지 입주예정자들에게 알려야 합니다.
통보 방법: '신축 공동주택 실내공기질 측정 계획서'를 입주예정자에게 서면(전자문서 포함)으로 직접 알리거나, 관련 규정에 따른 방법(인터넷 홈페이지 등)으로 명확히 공고하여 측정 일정을 투명하게 공개해야 합니다.</div>

            <div style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">라돈(Radon) 측정 의무와 권고기준</div>
            <div style="color: #475569; font-size: 11px; line-height: 1.4; white-space: pre-wrap;">라돈 측정은 일반적인 실내공기질 측정 절차(입주예정자 입회 등)와 동일하게 진행되며, 그 기준치는 시행규칙 제7조의2(신축 공동주택의 실내공기질 권고기준) 및 [별표 4의2]에 의해 명확한 수치로 통제받고 있습니다.
법적 권고기준 수치: 라돈의 기준치는 4.0pCi/L 이하입니다. (그 외 폼알데하이드, 벤젠, 톨루엔 등도 규제 항목에 포함됩니다.)
적용 대상 기준: 2018년 1월 1일 이후 사업계획 승인을 받은 신축 공동주택부터 라돈 측정이 법적 의무 항목으로 적용되었습니다.
측정 방식의 제한: 시공사 임의의 측정 방식은 법적 효력이 없으며, 반드시 「환경분야 시험·검사 등에 관한 법률」에 따른 환경오염공정시험기준을 엄격히 준수하여 측정해야만 합니다.</div>
        </div>
    </div>
  </div>
`;

export const generatePDFBlob = async (info: InspectionInfo, defects: DefectItem[], locations: string[]): Promise<Blob> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let cursorY = 0;

  const container = document.createElement('div');
  container.style.width = '794px'; 
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-9999';
  container.style.backgroundColor = 'white';
  document.body.appendChild(container);

  // --- Rendering Helpers ---

  const captureAndAdd = async (html: string) => {
    container.innerHTML = html;
    await new Promise(resolve => setTimeout(resolve, 50));

    const canvas = await html2canvas(container, {
      scale: 2, // Increased scale for better quality
      useCORS: true,
      logging: false,
      windowWidth: 794,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.9); // Increased quality
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    if (cursorY + imgHeight > pageHeight) {
      pdf.addPage();
      cursorY = 0;
    }

    pdf.addImage(imgData, 'JPEG', 0, cursorY, pageWidth, imgHeight);
    cursorY += imgHeight;
    container.innerHTML = '';
  };

  const renderToImageData = async (html: string) => {
    container.innerHTML = html;
    
    // Wait for all images in the container to load
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = () => {
          console.warn('Image failed to load in PDF:', img.src);
          // Set a fallback transparent 1x1 image on error so html2canvas doesn't crash
          img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          resolve(null);
        };
      });
    }));

    await new Promise(resolve => setTimeout(resolve, 50));
    const canvas = await html2canvas(container, {
      scale: 2, // Increased scale for better quality
      useCORS: true,
      logging: false,
      windowWidth: 794,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.9); // Increased quality
    container.innerHTML = '';
    return { imgData, imgHeight };
  };

  try {
    // 1. HEADER
    const headerHtml = `
      <div style="width: 794px; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #fff;">
        <div style="background-color: #172447; padding: 30px 50px;">
           <table style="width: 100%; border-collapse: collapse;">
             <tr>
               <td style="vertical-align: bottom;">
                 <h1 style="font-size: 34px; font-weight: 800; margin: 0; letter-spacing: -0.5px; line-height: 1; color: #ffffff;">PRE-INSPECTION REPORT</h1>
                 <p style="font-size: 14px; opacity: 0.9; margin: 8px 0 0 0; font-weight: 400; color: #ffffff;">주택 사전점검 정밀 보고서</p>
               </td>
               <td style="text-align: right; vertical-align: bottom;">
                 <div>
                    <div style="font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">Double Check</div>
                    <div style="font-size: 11px; font-weight: 600; color: #bae6fd; margin-top: 4px; letter-spacing: 2px; text-transform: uppercase;">Professional Report</div>
                 </div>
               </td>
             </tr>
           </table>
        </div>

        <div style="padding: 20px 50px; border-bottom: 8px solid #f8fafc;">
           <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
              <tr>
                 <td style="width: 32%; padding-right: 20px; vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">아파트명</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.3;">${info.apartmentName}</div>
                 </td>
                 <td style="width: 25%; padding: 0 20px; border-left: 1px solid #f1f5f9; vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">동/호수</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${info.unit}</div>
                 </td>
                 <td style="width: 23%; padding: 0 20px; border-left: 1px solid #f1f5f9; vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">타입/평수</div>
                    <div style="font-size: 16px; font-weight: 800; color: #0f172a; white-space: nowrap;">${info.typeSize}</div>
                 </td>
                 <td style="width: 20%; padding-left: 20px; border-left: 1px solid #f1f5f9; vertical-align: middle;">
                     <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">점검일자</div>
                     <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${info.date.split('T')[0]}</div>
                 </td>
              </tr>
           </table>

           <div style="height: 12px;"></div>

           <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
              <tr>
                 <td style="width: 35%; padding-right: 20px; vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">고객명</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${info.inspectorName}</div>
                 </td>
                 <td style="width: 25%; padding: 0 20px; border-left: 1px solid #f1f5f9; vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 6px;">연락처</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${info.phoneNumber}</div>
                 </td>
                 <td style="width: 40%; padding-left: 20px; border-left: 1px solid #f1f5f9; vertical-align: middle;">
                    <div style="background: #f0f9ff; padding: 12px 16px; border-radius: 8px; border: 1px solid #e0f2fe;">
                        <table style="width: 100%; border-collapse: collapse;">
                           <tr>
                              <td style="font-size: 18px; font-weight: 700; color: #0369a1; vertical-align: middle; padding-top: 1px; padding-bottom: 20px;">총 하자 적출</td>
                              <td style="text-align: right; font-size: 15px; font-weight: 900; color: #172447; vertical-align: middle; padding-top: 1px; padding-bottom: 20px;">${defects.filter(d => d.location !== '공기질,라돈').length}<span style="font-size:18px; font-weight:500; margin-left:5px; color:#64748b;">건</span></td>
                           </tr>
                        </table>
                    </div>
                 </td>
              </tr>
           </table>
        </div>
      </div>
    `;
    await captureAndAdd(headerHtml);

    // 2. DEFECTS PROCESSING
    const grouped = defects.reduce((acc, d) => {
      (acc[d.location] = acc[d.location] || []).push(d);
      return acc;
    }, {} as Record<string, DefectItem[]>);

    const sortedLocations = Object.keys(grouped).sort((a, b) => {
      const idxA = locations.indexOf(a);
      const idxB = locations.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const location of sortedLocations) {
      const defectsInLocation = grouped[location];
      
      for (let i = 0; i < defectsInLocation.length; i++) {
        const d = defectsInLocation[i];
        const standard = getMatchingStandard(d.description);

        // --- ATOMIC RENDERING STRATEGY ---
        const parts: string[] = [];

        // CRITICAL: If this is the FIRST defect of the location, PREPEND the Location Header
        if (i === 0) {
            parts.push(getLocationHeaderHtml(location, defectsInLocation.length));
        }

        parts.push(getDefectHeaderHtml(i, d.description));
        if (d.farPhotos.length > 0) parts.push(getPhotoSectionHtml('원거리 사진 (위치 식별)', '#15803d', d.farPhotos));
        if (d.nearPhotos.length > 0) parts.push(getPhotoSectionHtml('근거리 사진 (상세 하자)', '#0369a1', d.nearPhotos));
        if (standard) parts.push(getStandardHtml(standard));
        
        // Append Radon Legal HTML if it's the last item in the '공기질,라돈' location
        if (location === '공기질,라돈' && i === defectsInLocation.length - 1) {
            parts.push(getRadonLegalHtml());
        }
        
        parts.push(getDividerHtml());

        const fullDefectHtml = parts.join('');

        // 1. Render to an image in memory to check its height
        const { imgData, imgHeight } = await renderToImageData(fullDefectHtml);

        // 2. Decision Logic
        if (imgHeight < pageHeight) {
          // Case A: The whole defect block fits on a single page
          // Check if it fits in the *current* remaining space.
          if (cursorY + imgHeight > pageHeight) {
            pdf.addPage();
            cursorY = 0;
          }
          pdf.addImage(imgData, 'JPEG', 0, cursorY, pageWidth, imgHeight);
          cursorY += imgHeight;

        } else {
          // Case B: The defect is HUGE (too many photos). It exceeds A4 height on its own.
          // We MUST split it component by component.
          // Start on a new page to give it maximum initial space.
          if (cursorY > 20) { 
             pdf.addPage();
             cursorY = 0;
          }
          
          for (const partHtml of parts) {
            await captureAndAdd(partHtml);
          }
        }
      }
    }

    if (document.body.contains(container)) document.body.removeChild(container);
    return pdf.output('blob');
  } catch (err) {
    if (document.body.contains(container)) document.body.removeChild(container);
    throw err;
  }
};

export const generatePDF = async (info: InspectionInfo, defects: DefectItem[], locations: string[]) => {
  const blob = await generatePDFBlob(info, defects, locations);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${info.apartmentName}_${info.unit}_보고서.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

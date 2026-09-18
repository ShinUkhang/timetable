const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dutyDir = path.join(__dirname, '등교급식지도');
const htmlPath = path.join(__dirname, 'index.html');

console.log('====================================================');
console.log('🏫 배화여고 등교·급식 지도 데이터 자동 동기화 시작');
console.log('====================================================');

if (!fs.existsSync(dutyDir)) {
    console.error('[오류] 등교급식지도 폴더를 찾을 수 없습니다:', dutyDir);
    process.exit(1);
}

const files = fs.readdirSync(dutyDir).filter(f => 
    (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$')
);

if (files.length === 0) {
    console.log('[알림] 등교급식지도 폴더에 엑셀 파일(.xlsx)이 없습니다.');
} else {
    console.log(`[탐색 완료] 총 ${files.length}개의 엑셀 파일을 발견했습니다:`);
    files.forEach(f => console.log(` - ${f}`));
}

const dutyData = {
    updatedAt: new Date().toISOString(),
    noticeMorning: '',
    noticeLunch: '',
    dates: {}
};

function parseDateCell(val, defaultYear = 2026) {
    if (val === undefined || val === null) return null;
    
    // 엑셀 시리얼 넘버인 경우
    if (typeof val === 'number') {
        const d = xlsx.SSF.parse_date_code(val);
        if (d && d.m && d.d) {
            const mStr = String(d.m).padStart(2, '0');
            const dStr = String(d.d).padStart(2, '0');
            const yStr = String(d.y || defaultYear);
            return {
                key: `${yStr}-${mStr}-${dStr}`,
                display: `${d.m}월 ${d.d}일`,
                year: parseInt(yStr),
                month: d.m,
                day: d.d
            };
        }
    }
    
    const str = String(val).trim();
    // '9월 1일' 또는 '09월 01일'
    const mMatch = str.match(/(\d+)\s*월\s*(\d+)\s*일/);
    if (mMatch) {
        const m = parseInt(mMatch[1]);
        const d = parseInt(mMatch[2]);
        const mStr = String(m).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        return {
            key: `${defaultYear}-${mStr}-${dStr}`,
            display: `${m}월 ${d}일`,
            year: defaultYear,
            month: m,
            day: d
        };
    }
    
    // '2026-09-01' 또는 '2026.09.01' 또는 '2026/09/01'
    const isoMatch = str.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (isoMatch) {
        const y = parseInt(isoMatch[1]);
        const m = parseInt(isoMatch[2]);
        const d = parseInt(isoMatch[3]);
        const mStr = String(m).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        return {
            key: `${y}-${mStr}-${dStr}`,
            display: `${m}월 ${d}일`,
            year: y,
            month: m,
            day: d
        };
    }

    // '9-1' 또는 '9/1'
    const shortMatch = str.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (shortMatch) {
        const m = parseInt(shortMatch[1]);
        const d = parseInt(shortMatch[2]);
        const mStr = String(m).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        return {
            key: `${defaultYear}-${mStr}-${dStr}`,
            display: `${m}월 ${d}일`,
            year: defaultYear,
            month: m,
            day: d
        };
    }

    return null;
}

// 엑셀 파일들 순회 처리
files.forEach(fileName => {
    const fullPath = path.join(dutyDir, fileName);
    try {
        const wb = xlsx.readFile(fullPath);
        wb.SheetNames.forEach(sheetName => {
            const sheet = wb.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            const cleanSheetName = sheetName.replace(/\s+/g, '');
            
            // 1. 등교지도 시트
            if (cleanSheetName.includes('등교')) {
                // 안내 사항 탐색
                rows.forEach(r => {
                    r.forEach(c => {
                        if (typeof c === 'string' && c.includes('등교지도 안내')) {
                            dutyData.noticeMorning = c.trim();
                        }
                    });
                });
                
                // 데이터 행 추출
                rows.forEach(r => {
                    if (!r || r.length < 3) return;
                    const dObj = parseDateCell(r[0]);
                    if (dObj) {
                        if (!dutyData.dates[dObj.key]) {
                            dutyData.dates[dObj.key] = {
                                dateStr: dObj.key,
                                displayDate: dObj.display,
                                dayOfWeek: String(r[1] || '').replace('요일', '').trim(),
                                morning: { main: '-', annex: '-', timeMain: '07:30~08:00', timeAnnex: '07:30~07:50' },
                                lunch: { floor3: '-', floor4: '-', time: '12:10~13:10' }
                            };
                        }
                        const dayStr = String(r[1] || '').replace('요일', '').trim();
                        if (dayStr) dutyData.dates[dObj.key].dayOfWeek = dayStr;
                        
                        const mainT = String(r[2] || '-').trim();
                        const annexT = String(r[3] || '-').trim();
                        if (mainT && mainT !== 'null' && mainT !== 'undefined') {
                            dutyData.dates[dObj.key].morning.main = mainT;
                        }
                        if (annexT && annexT !== 'null' && annexT !== 'undefined') {
                            dutyData.dates[dObj.key].morning.annex = annexT;
                        }
                    }
                });
            }
            
            // 2. 중식지도 시트
            if (cleanSheetName.includes('중식') || cleanSheetName.includes('급식')) {
                // 안내 사항 탐색
                rows.forEach(r => {
                    r.forEach(c => {
                        if (typeof c === 'string' && (c.includes('중식지도 안내') || c.includes('급식지도 안내'))) {
                            dutyData.noticeLunch = c.trim();
                        }
                    });
                });
                
                // 데이터 행 추출
                rows.forEach(r => {
                    if (!r || r.length < 3) return;
                    const dObj = parseDateCell(r[0]);
                    if (dObj) {
                        if (!dutyData.dates[dObj.key]) {
                            dutyData.dates[dObj.key] = {
                                dateStr: dObj.key,
                                displayDate: dObj.display,
                                dayOfWeek: String(r[1] || '').replace('요일', '').trim(),
                                morning: { main: '-', annex: '-', timeMain: '07:30~08:00', timeAnnex: '07:30~07:50' },
                                lunch: { floor3: '-', floor4: '-', time: '12:10~13:10' }
                            };
                        }
                        const dayStr = String(r[1] || '').replace('요일', '').trim();
                        if (dayStr) dutyData.dates[dObj.key].dayOfWeek = dayStr;
                        
                        const f3 = String(r[2] || '-').trim();
                        const f4 = String(r[3] || '-').trim();
                        if (f3 && f3 !== 'null' && f3 !== 'undefined') {
                            dutyData.dates[dObj.key].lunch.floor3 = f3;
                        }
                        if (f4 && f4 !== 'null' && f4 !== 'undefined') {
                            dutyData.dates[dObj.key].lunch.floor4 = f4;
                        }
                    }
                });
            }
        });
    } catch (err) {
        console.error(`[오류] 파일 읽기 실패 (${fileName}):`, err.message);
    }
});

const sortedDates = Object.keys(dutyData.dates).sort();
console.log(`[파싱 성공] 총 ${sortedDates.length}일치 지도 데이터를 구축했습니다.`);
if (sortedDates.length > 0) {
    console.log(` - 기간: ${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`);
}

// 기본 안내 문구 채우기
if (!dutyData.noticeMorning) {
    dutyData.noticeMorning = '★ 학생 등교지도 안내 사항★\n- 지도 시간 : 본관 07:30~08:00, 별관 07:30~07:50\n- 지도 위치 : 지도1교사 - 본관 입구, 지도2교사 - 별관 입구(50분에 출입문 통제)\n- 각 학년부 벌점계 선생님께 기록을 위해 명렬표 인계 (주1회 금요일 황상희T)';
}
if (!dutyData.noticeLunch) {
    dutyData.noticeLunch = '★ 학생 중식지도 안내사항★\n- 지도 시간 : 12:10~13:10\n- 학생 착석 지도 : 3학년 - 3,4층 / 2학년 - 3층 / 1학년 - 4층 (우측 열 뒤부터 앞좌석 순)\n- 중식 중 정숙 지도 및 개인 위생 지도';
}

// index.html에 주입
if (!fs.existsSync(htmlPath)) {
    console.error('[오류] index.html 파일을 찾을 수 없습니다:', htmlPath);
    process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

const injectionScript = `<!-- DUTY_DATA_START -->
<script>
window.DUTY_SCHEDULE_DATA = ${JSON.stringify(dutyData, null, 2)};
</script>
<!-- DUTY_DATA_END -->`;

if (html.includes('<!-- DUTY_DATA_START -->')) {
    html = html.replace(/<!-- DUTY_DATA_START -->[\s\S]*?<!-- DUTY_DATA_END -->/, injectionScript);
    console.log('[업데이트] index.html의 기존 등교·급식 데이터 블록을 갱신했습니다.');
} else {
    // <script> 태그 바로 위에 삽입
    const scriptIdx = html.indexOf('<script>');
    if (scriptIdx !== -1) {
        html = html.slice(0, scriptIdx) + injectionScript + '\n' + html.slice(scriptIdx);
        console.log('[삽입 완료] index.html에 새 등교·급식 데이터 블록을 추가했습니다.');
    } else {
        html = html.replace('</body>', injectionScript + '\n</body>');
        console.log('[삽입 완료] index.html 닫는 태그 앞에 등교·급식 데이터 블록을 추가했습니다.');
    }
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('🎉 index.html 반영 완료!');
console.log('====================================================');

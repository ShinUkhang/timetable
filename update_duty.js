const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dutyDir = path.join(__dirname, '등교급식지도');
const htmlPath = path.join(__dirname, 'index.html');

console.log('====================================================');
console.log('🏫 배화여고 등교·급식·야자 지도 데이터 자동 동기화');
console.log('====================================================');

// 구글 스프레드시트 야자감독 링크
const GSHEET_URL_GRADE1 = 'https://docs.google.com/spreadsheets/d/1rz0sBh_WM2mCnz0mQplqnk3rqGxS0wbKfExJcvsFdNI/export?format=csv&gid=1066659445';
const GSHEET_URL_GRADE23 = 'https://docs.google.com/spreadsheets/d/163ZwXKA3Ww3-vYQmtXNI1FxV1vqRxSa9fIzig-vhuF8/export?format=csv&gid=0';

const dutyData = {
    updatedAt: new Date().toISOString(),
    links: {
        nightGrade1: 'https://docs.google.com/spreadsheets/d/1rz0sBh_WM2mCnz0mQplqnk3rqGxS0wbKfExJcvsFdNI/edit?gid=1066659445#gid=1066659445',
        nightGrade23: 'https://docs.google.com/spreadsheets/d/163ZwXKA3Ww3-vYQmtXNI1FxV1vqRxSa9fIzig-vhuF8/edit?gid=0#gid=0'
    },
    noticeMorning: '★ 학생 등교지도 안내 사항★\n- 지도 시간 : 본관 07:30~08:00, 별관 07:30~07:50\n- 지도 위치 : 지도1교사 - 본관 입구, 지도2교사 - 별관 입구(50분에 출입문 통제)\n- 각 학년부 벌점계 선생님께 기록을 위해 명렬표 인계 (주1회 금요일 황상희T)',
    noticeLunch: '★ 학생 중식지도 안내사항★\n- 지도 시간 : 12:10~13:10\n- 학생 착석 지도 : 3학년 - 3,4층 / 2학년 - 3층 / 1학년 - 4층 (우측 열 뒤부터 앞좌석 순)\n- 중식 중 정숙 지도 및 개인 위생 지도',
    noticeNight: '★ 자기주도학습(야간자율학습) 지도 안내사항★\n- 1학년: 믿음방\n- 2,3학년: 별관 4층\n- 감독 변경 시 구글 스프레드시트 <감독변경> 란에 기재',
    dates: {}
};

function getOrCreateDate(key, defaultYear = 2026) {
    if (!dutyData.dates[key]) {
        const parts = key.split('-');
        const m = parseInt(parts[1]);
        const d = parseInt(parts[2]);
        dutyData.dates[key] = {
            dateStr: key,
            displayDate: `${m}월 ${d}일`,
            year: parseInt(parts[0]),
            month: m,
            day: d,
            dayOfWeek: '',
            morning: { main: '-', annex: '-', timeMain: '07:30~08:00', timeAnnex: '07:30~07:50' },
            lunch: { floor3: '-', floor4: '-', time: '12:10~13:10' },
            night: {
                grade1: { teacher: '-', original: '-', changed: false, note: '', place: '믿음방' },
                grade23: { teacher: '-', original: '-', changed: false, note: '', place: '별관 4층' }
            }
        };
    }
    return dutyData.dates[key];
}

function parseDateCell(val, defaultYear = 2026) {
    if (val === undefined || val === null) return null;
    
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

    const shortMatch = str.match(/^(\d{1,2})[-/](\d{1,2})/);
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

function cleanTeacherName(raw) {
    if (!raw) return '';
    let name = String(raw).replace(/선생님/g, '').replace(/\s+/g, '').trim();
    const pMatch = name.match(/^([가-힣]{2,4})\(/);
    if (pMatch) name = pMatch[1];
    return name;
}

function isSpecialEvent(text) {
    if (!text) return false;
    const keywords = ['학평', '모평', '평가', '고사', '총회', '탐방', '휴일', '휴업', '추석', '수능', '방학', '석식', '준비', '난원제', '예비소집'];
    return keywords.some(k => text.includes(k));
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur.trim());
        return result;
    });
}

// 1. 로컬 엑셀 파일 파싱 (등교, 중식)
function parseLocalExcel() {
    if (!fs.existsSync(dutyDir)) return;
    const files = fs.readdirSync(dutyDir).filter(f => 
        (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$')
    );
    console.log(`[1] 등교·급식 폴더 탐색: 총 ${files.length}개 엑셀 파일 발견`);

    files.forEach(fileName => {
        const fullPath = path.join(dutyDir, fileName);
        try {
            const wb = xlsx.readFile(fullPath);
            wb.SheetNames.forEach(sheetName => {
                const sheet = wb.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                const cleanSheetName = sheetName.replace(/\s+/g, '');
                
                // 등교지도
                if (cleanSheetName.includes('등교')) {
                    rows.forEach(r => {
                        if (!r || r.length < 3) return;
                        const dObj = parseDateCell(r[0]);
                        if (dObj) {
                            const entry = getOrCreateDate(dObj.key, dObj.year);
                            entry.displayDate = dObj.display;
                            const dayStr = String(r[1] || '').replace('요일', '').trim();
                            if (dayStr) entry.dayOfWeek = dayStr;
                            
                            const mainT = cleanTeacherName(r[2]);
                            const annexT = cleanTeacherName(r[3]);
                            if (mainT && mainT !== 'null' && mainT !== 'undefined') entry.morning.main = mainT;
                            if (annexT && annexT !== 'null' && annexT !== 'undefined') entry.morning.annex = annexT;
                        }
                    });
                }
                
                // 중식지도
                if (cleanSheetName.includes('중식') || cleanSheetName.includes('급식')) {
                    rows.forEach(r => {
                        if (!r || r.length < 3) return;
                        const dObj = parseDateCell(r[0]);
                        if (dObj) {
                            const entry = getOrCreateDate(dObj.key, dObj.year);
                            entry.displayDate = dObj.display;
                            const dayStr = String(r[1] || '').replace('요일', '').trim();
                            if (dayStr) entry.dayOfWeek = dayStr;
                            
                            const f3 = cleanTeacherName(r[2]);
                            const f4 = cleanTeacherName(r[3]);
                            if (f3 && f3 !== 'null' && f3 !== 'undefined') entry.lunch.floor3 = f3;
                            if (f4 && f4 !== 'null' && f4 !== 'undefined') entry.lunch.floor4 = f4;
                        }
                    });
                }
            });
        } catch (err) {
            console.error(`[오류] 엑셀 파싱 실패 (${fileName}):`, err.message);
        }
    });
}

// 2. 구글 스프레드시트 야자감독 파싱
async function parseGoogleSheetsNightDuty() {
    console.log('[2] 구글 스프레드시트 야자감독 데이터 수집 중...');
    
    // (A) 1학년 야자 (믿음방)
    try {
        console.log(' - 1학년 야자감독 시트 다운로드...');
        const res1 = await fetch(GSHEET_URL_GRADE1);
        if (res1.ok) {
            const rows1 = parseCSV(await res1.text());
            for (let i = 2; i < rows1.length; i++) {
                const r = rows1[i];
                if (!r || r.length < 4) continue;
                const dObj = parseDateCell(r[1]);
                if (!dObj) continue;

                const entry = getOrCreateDate(dObj.key);
                entry.displayDate = dObj.display;
                const day = r[2] ? String(r[2]).replace('요일', '').trim() : '';
                if (day && !entry.dayOfWeek) entry.dayOfWeek = day;

                const rawOrig = r[3] || '';
                const rawChange = r[4] || '';

                if (isSpecialEvent(rawOrig)) {
                    entry.night.grade1.note = rawOrig;
                    entry.night.grade1.teacher = rawOrig;
                } else {
                    const origT = cleanTeacherName(rawOrig);
                    const changeT = cleanTeacherName(rawChange);

                    if (changeT) {
                        entry.night.grade1.teacher = changeT;
                        entry.night.grade1.original = origT || '-';
                        entry.night.grade1.changed = true;
                    } else if (origT) {
                        entry.night.grade1.teacher = origT;
                        entry.night.grade1.original = origT;
                        entry.night.grade1.changed = false;
                    }
                }
            }
            console.log('   ✔ 1학년 야자감독 수집 완료');
        }
    } catch (e) {
        console.warn('   ⚠ 1학년 야자감독 시트 가져오기 실패 (네트워크 확인):', e.message);
    }

    // (B) 2,3학년 야자 (별관 4층)
    try {
        console.log(' - 2·3학년 야자감독 시트 다운로드...');
        const res23 = await fetch(GSHEET_URL_GRADE23);
        if (res23.ok) {
            const rows23 = parseCSV(await res23.text());
            const blocks = [
                { startRow: 30, endRow: 41, colDate: 5, colTeacher: 6 },
                { startRow: 4, endRow: 25, colDate: 5, colTeacher: 6 },
                { startRow: 4, endRow: 20, colDate: 8, colTeacher: 9 },
                { startRow: 4, endRow: 25, colDate: 11, colTeacher: 12 }
            ];

            blocks.forEach(b => {
                for (let i = b.startRow; i <= b.endRow; i++) {
                    const r = rows23[i];
                    if (!r || r.length <= b.colTeacher) continue;
                    const dStr = r[b.colDate];
                    const rawT = r[b.colTeacher];
                    if (!dStr || !rawT) continue;

                    const dObj = parseDateCell(dStr);
                    if (!dObj) continue;

                    const entry = getOrCreateDate(dObj.key);
                    entry.displayDate = dObj.display;

                    if (isSpecialEvent(rawT)) {
                        entry.night.grade23.note = rawT;
                        entry.night.grade23.teacher = rawT;
                    } else {
                        const t = cleanTeacherName(rawT);
                        entry.night.grade23.teacher = t;
                        entry.night.grade23.original = t;
                    }
                }
            });
            console.log('   ✔ 2·3학년 야자감독 수집 완료');
        }
    } catch (e) {
        console.warn('   ⚠ 2·3학년 야자감독 시트 가져오기 실패 (네트워크 확인):', e.message);
    }
}

async function main() {
    parseLocalExcel();
    await parseGoogleSheetsNightDuty();

    const sortedDates = Object.keys(dutyData.dates).sort();
    console.log(`[통합 완료] 총 ${sortedDates.length}일간의 등교·급식·야자 데이터 구축 완료!`);
    if (sortedDates.length > 0) {
        console.log(` - 기간: ${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`);
    }

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
        console.log('[업데이트] index.html의 등교·급식·야자 데이터 블록을 갱신했습니다.');
    } else {
        const scriptIdx = html.indexOf('<script>');
        if (scriptIdx !== -1) {
            html = html.slice(0, scriptIdx) + injectionScript + '\n' + html.slice(scriptIdx);
        } else {
            html = html.replace('</body>', injectionScript + '\n</body>');
        }
        console.log('[삽입 완료] index.html에 등교·급식·야자 데이터 블록을 추가했습니다.');
    }

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('🎉 index.html 동기화 완료!');
    console.log('====================================================');
}

main();

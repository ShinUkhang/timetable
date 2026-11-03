// 교보문고 베스트셀러(실시간·일간·주간 상위 100위)와 교직원 희망도서의 교보 상품 정보(분야·ISBN)를 JSON으로 저장한다.
// GitHub Actions(.github/workflows/kyobo-best.yml)가 매시간 실행해 kyobo-data 브랜치에 올린다.
// 사용: node scripts/fetch_kyobo_best.js <출력 파일>
const fs = require('fs');
const path = require('path');

const BASE = 'https://store.kyobobook.co.kr/api/gw/best/best-seller';
const LISTS = {
    realtime: `${BASE}/realtime?page=1&per=100`,
    daily: `${BASE}/online?page=1&per=100&period=001&dsplDvsnCode=000&dsplTrgtDvsnCode=001`,
    weekly: `${BASE}/online?page=1&per=100&period=002&dsplDvsnCode=000&dsplTrgtDvsnCode=001`
};
const BOOK_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1A5YTxhvW4R6L5y7uWisIWn5ao8rXggU1dNh_6qTWPOY/export?format=csv&gid=0';
const PREVIOUS_JSON = 'https://raw.githubusercontent.com/ShinUkhang/timetable/kyobo-data/kyobo_best.json';

// 교보문고 국내도서 대분류 (분야 코드 앞 2자리)
const KYOBO_CATEGORY = {
    '01': '소설', '03': '시/에세이', '05': '인문', '07': '가정/육아', '08': '요리', '09': '건강',
    '11': '취미/실용/스포츠', '13': '경제/경영', '15': '자기계발', '17': '정치/사회', '19': '역사/문화',
    '21': '종교', '23': '예술/대중문화', '25': '중/고등참고서', '26': '기술/공학', '27': '외국어',
    '29': '과학', '31': '취업/수험서', '32': '여행', '33': '컴퓨터/IT', '35': '잡지', '38': '청소년',
    '39': '초등참고서', '41': '유아(0~7세)', '42': '어린이(초등)', '47': '만화', '50': '대학교재', '51': '문고'
};

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9'
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, referer) {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json', Referer: referer || 'https://store.kyobobook.co.kr/' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
}

async function fetchList(url) {
    const json = await getJson(url, 'https://store.kyobobook.co.kr/bestseller/online');
    const list = json?.data?.bestSeller || [];
    return {
        ymw: json?.data?.ymw || null,
        items: list.map(b => ({
            rank: b.prstRnkn,
            prevRank: b.frmrRnkn || null,
            title: b.cmdtName,
            author: b.chrcName,
            publisher: b.pbcmName,
            isbn: b.cmdtCode,
            id: b.saleCmdtid,
            price: b.price,
            category: b.saleCmdtClstName || KYOBO_CATEGORY[(b.saleCmdtClstCode || '').slice(0, 2)] || '',
            rating: b.buyRevwRvgr || null
        }))
    };
}

// 줄바꿈이 들어간 칸도 처리하는 CSV 파서
function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cur); rows.push(row); row = []; cur = '';
        } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.map(r => r.map(x => x.trim()));
}

// 제목 비교용 키 (앱의 bookKey 와 같은 규칙)
function bookKey(t) {
    return String(t || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase();
}

async function readRequestedBooks() {
    const res = await fetch(BOOK_SHEET_CSV, { headers: HEADERS });
    if (!res.ok) throw new Error(`희망도서 시트 HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    const hi = rows.findIndex(r => r[0] === '순번' && r.some(c => c.includes('서명')));
    if (hi < 0) return [];
    const h = rows[hi];
    const col = name => h.findIndex(c => c.includes(name));
    const ti = col('서명'), ai = col('저자'), pi = col('출판사');
    return rows.slice(hi + 1)
        .filter(r => r[0] !== '예시' && r[ti])
        .map(r => ({ title: r[ti], author: r[ai] || '', publisher: r[pi] || '' }));
}

// 교보 통합검색 결과에서 상품 후보(pid, isbn, 이름) 추출
async function searchKyobo(keyword) {
    const url = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(keyword)}&gbCode=TOT&target=total`;
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html' } });
    if (!res.ok) throw new Error(`검색 HTTP ${res.status}`);
    const html = await res.text();
    const out = [];
    const re = /data-pid="(S\d+)"\s+data-bid="(\d+)"\s+data-name="([^"]*)"\s+data-code="KOR"/g;
    let m;
    while ((m = re.exec(html)) && out.length < 10) {
        if (!out.some(o => o.id === m[1])) out.push({ id: m[1], isbn: m[2], name: m[3] });
    }
    return out;
}

async function lookupBook(book) {
    const key = bookKey(book.title);
    let cands = await searchKyobo(`${book.title} ${book.author}`.trim());
    if (!cands.length) cands = await searchKyobo(book.title);
    if (!cands.length) return null;
    // 제목이 가장 잘 맞는 후보
    const pick = cands.find(c => bookKey(c.name) === key)
        || cands.find(c => bookKey(c.name).includes(key) || key.includes(bookKey(c.name)))
        || cands[0];
    const detail = await getJson(`https://product.kyobobook.co.kr/api/gw/pdt/product/${pick.id}`, `https://product.kyobobook.co.kr/detail/${pick.id}`);
    const clst = detail?.data?.info?.saleCmdtClstCode || '';
    return {
        id: pick.id,
        isbn: detail?.data?.info?.cmdtCode || pick.isbn,
        name: pick.name,
        clst,
        category: KYOBO_CATEGORY[clst.slice(0, 2)] || ''
    };
}

async function main() {
    const out = process.argv[2] || 'kyobo_best.json';
    const result = { updatedAt: new Date().toISOString() };
    for (const [key, url] of Object.entries(LISTS)) {
        try {
            result[key] = await fetchList(url);
            console.log(`${key}: ${result[key].items.length}권`);
        } catch (e) {
            console.error(`${key} 실패:`, e.message);
            result[key] = { ymw: null, items: [] };
        }
    }
    if (!result.realtime.items.length && !result.daily.items.length) {
        console.error('순위를 하나도 받지 못했습니다.');
        process.exit(1);
    }

    // 희망도서의 교보 상품 정보 (이전 결과에 있으면 다시 찾지 않음)
    let previous = {};
    try {
        const prev = await (await fetch(PREVIOUS_JSON)).json();
        previous = prev.books || {};
    } catch (e) { /* 첫 실행 */ }
    result.books = {};
    try {
        const requested = await readRequestedBooks();
        let looked = 0;
        for (const b of requested) {
            const key = bookKey(b.title);
            if (!key || result.books[key]) continue;
            if (previous[key] && previous[key].id) { result.books[key] = previous[key]; continue; }
            try {
                const info = await lookupBook(b);
                if (info) result.books[key] = info;
                looked++;
                await sleep(400);
            } catch (e) {
                console.warn(`도서 검색 실패 (${b.title}):`, e.message);
            }
        }
        console.log(`희망도서 ${requested.length}권 (새로 검색 ${looked}권, 분류 ${Object.keys(result.books).length}권)`);
    } catch (e) {
        console.warn('희망도서 처리 실패:', e.message);
        result.books = previous;
    }

    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result));
}

main();

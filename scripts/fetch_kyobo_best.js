// 교보문고 베스트셀러(실시간·일간·주간) 상위 20위를 받아 JSON으로 저장한다.
// GitHub Actions(.github/workflows/kyobo-best.yml)가 매시간 실행해 kyobo-data 브랜치에 올린다.
// 사용: node scripts/fetch_kyobo_best.js <출력 파일>
const fs = require('fs');
const path = require('path');

const BASE = 'https://store.kyobobook.co.kr/api/gw/best/best-seller';
const LISTS = {
    realtime: `${BASE}/realtime?page=1&per=20`,
    daily: `${BASE}/online?page=1&per=20&period=001&dsplDvsnCode=000&dsplTrgtDvsnCode=001`,
    weekly: `${BASE}/online?page=1&per=20&period=002&dsplDvsnCode=000&dsplTrgtDvsnCode=001`
};

async function fetchList(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://store.kyobobook.co.kr/bestseller/online'
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const json = await res.json();
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
            category: b.saleCmdtClstName || '',
            rating: b.buyRevwRvgr || null
        }))
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
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result));
}

main();

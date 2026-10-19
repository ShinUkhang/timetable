/*
 * 수업변경 요청서(HWP) 자동 작성 모듈
 * - forms/class_change_request.hwp 양식의 표 칸에 텍스트를 채워 새 HWP 파일을 만든다.
 * - 의존성: CFB (lib/cfb.min.js, SheetJS) — 압축(deflate)과 OLE 컨테이너 읽기/쓰기에 사용
 *
 * 양식 표 구조 (8행 x 8열)
 *   0행: 변경 전 | 변경 후
 *   1행: 날짜 | 학급 | 요일/교시 | 과목/교사 | 날짜 | 학급 | 요일/교시 | 과목/교사
 *   2~5행: 입력 칸 4줄
 *   6행: 근무상황(1열) | 변경사유(5열)
 *   7행: 요청자 "교사 ___ (인)"(1열) | 확인자(교감)
 */
(function (root) {
    const TAG_PARA_HEADER = 66, TAG_PARA_TEXT = 67, TAG_LIST_HEADER = 72;
    const DATA_ROWS = [2, 3, 4, 5];

    function readRecords(buf) {
        const recs = [];
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        let o = 0;
        while (o < buf.length) {
            const h = dv.getUint32(o, true);
            const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff;
            let size = h >>> 20;
            o += 4;
            if (size === 0xfff) { size = dv.getUint32(o, true); o += 4; }
            recs.push({ tag, level, data: buf.slice(o, o + size) });
            o += size;
        }
        return recs;
    }

    function writeRecords(recs) {
        let total = 0;
        for (const r of recs) total += 4 + (r.data.length >= 0xfff ? 4 : 0) + r.data.length;
        const out = new Uint8Array(total);
        const dv = new DataView(out.buffer);
        let o = 0;
        for (const r of recs) {
            const big = r.data.length >= 0xfff;
            dv.setUint32(o, (r.tag & 0x3ff) | ((r.level & 0x3ff) << 10) | ((big ? 0xfff : r.data.length) << 20), true);
            o += 4;
            if (big) { dv.setUint32(o, r.data.length, true); o += 4; }
            out.set(r.data, o);
            o += r.data.length;
        }
        return out;
    }

    function encodeParaText(text) {
        const s = String(text).replace(/[\r\n\t]+/g, ' ');
        const out = new Uint8Array((s.length + 1) * 2);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < s.length; i++) dv.setUint16(i * 2, s.charCodeAt(i), true);
        dv.setUint16(s.length * 2, 13, true); // 문단 끝
        return out;
    }

    // 표 칸(row,col)의 첫 문단 텍스트를 text로 바꾼다 (빈 칸이면 PARA_TEXT 레코드를 새로 넣는다)
    function setCellTexts(recs, cellTexts) {
        for (let i = 0; i < recs.length; i++) {
            const r = recs[i];
            if (r.tag !== TAG_LIST_HEADER || r.data.length < 16) continue;
            const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
            const key = dv.getUint16(10, true) + ',' + dv.getUint16(8, true);
            if (!(key in cellTexts)) continue;
            const text = cellTexts[key];
            if (text == null || text === '') continue;

            const ph = recs[i + 1];
            if (!ph || ph.tag !== TAG_PARA_HEADER) continue;
            const textData = encodeParaText(text);
            const phData = ph.data.slice();
            const pdv = new DataView(phData.buffer);
            const flag = pdv.getUint32(0, true) & 0x80000000;
            pdv.setUint32(0, (flag | (textData.length / 2)) >>> 0, true);
            ph.data = phData;

            const next = recs[i + 2];
            const textRec = { tag: TAG_PARA_TEXT, level: ph.level + 1, data: textData };
            if (next && next.tag === TAG_PARA_TEXT) recs[i + 2] = textRec;
            else recs.splice(i + 2, 0, textRec);
        }
    }

    function streamIndex(cfb, name) {
        return cfb.FullPaths.findIndex(p => p.replace(/\/$/, '').endsWith('/' + name));
    }

    /**
     * @param {Uint8Array} template 양식 HWP 바이트
     * @param {{rows: {before: string[], after: string[]}[], workStatus?: string, reason?: string, requester?: string}} data
     * @param {object} CFB SheetJS CFB 객체
     * @returns {Uint8Array} 작성된 HWP 바이트
     */
    function fill(template, data, CFB) {
        const cfb = CFB.read(template, { type: 'array' });
        const header = cfb.FileIndex[streamIndex(cfb, 'FileHeader')].content;
        const compressed = (header[36] & 1) === 1;
        const secIdx = streamIndex(cfb, 'BodyText/Section0');
        let sec = Uint8Array.from(cfb.FileIndex[secIdx].content);
        if (compressed) sec = Uint8Array.from(CFB.utils._inflateRaw(sec));

        const cellTexts = {};
        (data.rows || []).slice(0, DATA_ROWS.length).forEach((row, i) => {
            const r = DATA_ROWS[i];
            (row.before || []).forEach((v, c) => { cellTexts[r + ',' + c] = v; });
            (row.after || []).forEach((v, c) => { cellTexts[r + ',' + (c + 4)] = v; });
        });
        cellTexts['6,1'] = data.workStatus || '';
        cellTexts['6,5'] = data.reason || '';
        if (data.requester) cellTexts['7,1'] = `교사   ${data.requester}   (인)`;

        const recs = readRecords(sec);
        setCellTexts(recs, cellTexts);
        let out = writeRecords(recs);
        if (compressed) out = Uint8Array.from(CFB.utils._deflateRaw(out));

        const fi = cfb.FileIndex[secIdx];
        fi.content = out;
        fi.size = out.length;
        return Uint8Array.from(CFB.write(cfb, { type: 'array', fileType: 'cfb' }));
    }

    const api = { fill };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ClassChangeForm = api;
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * 수업변경 요청서(HWP) 자동 작성 모듈
 * - forms/class_change_request.hwp 양식의 표 칸에 텍스트를 채워 새 HWP 파일을 만든다.
 * - 입력 줄이 4개보다 많으면 표에 줄을 추가한다.
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
    const TAG_PARA_HEADER = 66, TAG_PARA_TEXT = 67, TAG_CTRL_HEADER = 71, TAG_LIST_HEADER = 72, TAG_TABLE = 77;
    const FIRST_DATA_ROW = 2, TEMPLATE_DATA_ROWS = 4;

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
            dv.setUint32(o, ((r.tag & 0x3ff) | ((r.level & 0x3ff) << 10) | ((big ? 0xfff : r.data.length) << 20)) >>> 0, true);
            o += 4;
            if (big) { dv.setUint32(o, r.data.length, true); o += 4; }
            out.set(r.data, o);
            o += r.data.length;
        }
        return out;
    }

    const view = d => new DataView(d.buffer, d.byteOffset, d.byteLength);
    const cellRow = r => view(r.data).getUint16(10, true);
    const cellCol = r => view(r.data).getUint16(8, true);

    // 표의 셀 범위 [{start, end, row}] (end는 다음 셀 시작 직전까지)
    function tableCells(recs, tableIdx) {
        const cellLevel = recs[tableIdx].level;
        const cells = [];
        let i = tableIdx + 1;
        while (i < recs.length && recs[i].level >= cellLevel) {
            if (recs[i].tag === TAG_LIST_HEADER && recs[i].level === cellLevel) {
                if (cells.length) cells[cells.length - 1].end = i;
                cells.push({ start: i, row: cellRow(recs[i]) });
            }
            i++;
        }
        if (cells.length) cells[cells.length - 1].end = i;
        return cells;
    }

    // 마지막 입력 줄을 복제해 표에 extra 줄을 추가한다
    function addDataRows(recs, extra) {
        if (extra <= 0) return;
        const tableIdx = recs.findIndex(r => r.tag === TAG_TABLE);
        const ctrl = recs[tableIdx - 1];
        const lastRow = FIRST_DATA_ROW + TEMPLATE_DATA_ROWS - 1;
        const cells = tableCells(recs, tableIdx);
        const rowCells = cells.filter(c => c.row === lastRow);
        const rowStart = rowCells[0].start, rowEnd = rowCells[rowCells.length - 1].end;
        const rowHeight = view(recs[rowStart].data).getUint32(20, true);

        // 아래쪽(근무상황·요청자) 셀의 행 번호를 밀어낸다
        for (const c of cells) {
            if (c.row > lastRow) {
                const d = recs[c.start].data.slice();
                view(d).setUint16(10, c.row + extra, true);
                recs[c.start].data = d;
            }
        }

        const newRecs = [];
        for (let k = 1; k <= extra; k++) {
            for (let i = rowStart; i < rowEnd; i++) {
                const r = recs[i];
                const d = r.data.slice();
                if (r.tag === TAG_LIST_HEADER && r.level === recs[tableIdx].level) view(d).setUint16(10, lastRow + k, true);
                newRecs.push({ tag: r.tag, level: r.level, data: d });
            }
        }
        recs.splice(rowEnd, 0, ...newRecs);

        // TABLE: 행 수와 행별 셀 수
        const t = recs[tableIdx].data;
        const tv = view(t);
        const rows = tv.getUint16(4, true);
        const sizesAt = 18;
        const nt = new Uint8Array(t.length + extra * 2);
        nt.set(t.subarray(0, sizesAt + (lastRow + 1) * 2), 0);
        const nv = view(nt);
        for (let k = 1; k <= extra; k++) nv.setUint16(sizesAt + (lastRow + k) * 2, rowCells.length, true);
        nt.set(t.subarray(sizesAt + (lastRow + 1) * 2), sizesAt + (lastRow + 1 + extra) * 2);
        nv.setUint16(4, rows + extra, true);
        recs[tableIdx].data = nt;

        // 표 개체 높이
        if (ctrl && ctrl.tag === TAG_CTRL_HEADER) {
            const cd = ctrl.data.slice();
            view(cd).setUint32(20, view(cd).getUint32(20, true) + rowHeight * extra, true);
            ctrl.data = cd;
        }
    }

    function encodeParaText(text) {
        const s = String(text).replace(/[\r\n\t]+/g, ' ');
        const out = new Uint8Array((s.length + 1) * 2);
        const dv = view(out);
        for (let i = 0; i < s.length; i++) dv.setUint16(i * 2, s.charCodeAt(i), true);
        dv.setUint16(s.length * 2, 13, true); // 문단 끝
        return out;
    }

    // 표 칸(row,col)의 첫 문단 텍스트를 바꾼다 (빈 칸이면 PARA_TEXT 레코드를 새로 넣는다)
    function setCellTexts(recs, cellTexts) {
        for (let i = 0; i < recs.length; i++) {
            const r = recs[i];
            if (r.tag !== TAG_LIST_HEADER || r.data.length < 16) continue;
            const text = cellTexts[cellRow(r) + ',' + cellCol(r)];
            if (text == null || text === '') continue;

            const ph = recs[i + 1];
            if (!ph || ph.tag !== TAG_PARA_HEADER) continue;
            const textData = encodeParaText(text);
            const phData = ph.data.slice();
            const pdv = view(phData);
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

        const rows = (data.rows || []).filter(row => (row.before || []).concat(row.after || []).some(v => v));
        const extra = Math.max(0, rows.length - TEMPLATE_DATA_ROWS);
        const recs = readRecords(sec);
        addDataRows(recs, extra);

        const cellTexts = {};
        rows.forEach((row, i) => {
            const r = FIRST_DATA_ROW + i;
            (row.before || []).forEach((v, c) => { cellTexts[r + ',' + c] = v; });
            (row.after || []).forEach((v, c) => { cellTexts[r + ',' + (c + 4)] = v; });
        });
        const infoRow = FIRST_DATA_ROW + TEMPLATE_DATA_ROWS + extra;
        cellTexts[infoRow + ',1'] = data.workStatus || '';
        cellTexts[infoRow + ',5'] = data.reason || '';
        if (data.requester) cellTexts[(infoRow + 1) + ',1'] = `교사   ${data.requester}   (인)`;

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

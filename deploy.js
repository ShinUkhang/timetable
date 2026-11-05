// 시간표 앱 배포: 바뀐 파일을 커밋하고 GitHub(main)에 올린다.
// 실시간_업데이트.bat 이 update_duty.js 다음에 실행한다.
// (배치 파일 안에서 한글 커밋 메시지를 쓰면 cmd 가 줄을 잘못 읽어 커밋이 안 되던 문제를 피하려고 Node 로 처리)
const { execFileSync } = require('child_process');

const SITE = 'https://shinukhang.github.io/timetable/';

function git(args, opts = {}) {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit' });
}

function hasStagedChanges() {
    try {
        execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: __dirname });
        return false;
    } catch (e) {
        return true;
    }
}

function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

try {
    console.log('\n[2/3] 💾 바뀐 파일 커밋 중...');
    git(['add', '-A']);
    if (hasStagedChanges()) {
        git(['commit', '-q', '-m', `update: 야자감독·결보강·공지·도서관 데이터 동기화 (${stamp()})`]);
        console.log('   ✔ 커밋 완료');
    } else {
        console.log('   (바뀐 내용이 없어 커밋은 건너뜁니다)');
    }

    console.log('\n[3/3] 🚀 GitHub 에 올리는 중...');
    try {
        git(['push', 'origin', 'main']);
    } catch (e) {
        // 다른 곳에서 먼저 올린 커밋이 있으면 받아서 합친 뒤 다시 올림
        console.log('   ↻ 원격 변경을 먼저 받아 합친 뒤 다시 올립니다...');
        git(['pull', '--rebase', 'origin', 'main']);
        git(['push', 'origin', 'main']);
    }

    console.log('\n================================================================');
    console.log(' 🎉 업데이트와 배포가 완료되었습니다!');
    console.log(` 👉 ${SITE}`);
    console.log(' (GitHub 특성상 1~2분 뒤 인터넷에 반영됩니다)');
    console.log('================================================================\n');
} catch (e) {
    console.error('\n❌ 배포에 실패했습니다. 위의 오류 메시지를 확인해 주세요.');
    console.error('   (네트워크 연결, GitHub 로그인 상태를 확인하세요)\n');
    process.exit(1);
}

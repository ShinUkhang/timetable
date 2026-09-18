@echo off
chcp 65001 > nul
echo ========================================================
echo    🏫 배화여고 스마트 시간표 및 등교·급식지도 원클릭 배포
echo ========================================================
echo.
echo [1/3] 등교·급식지도 엑셀 최신 데이터 동기화 중...
if exist "update_duty.js" (
    node update_duty.js
) else (
    echo [주의] update_duty.js 파일을 찾을 수 없어 엑셀 파싱을 건너뜁니다.
)

echo.
echo [2/3] 변경 사항 커밋 확인 중...
git add .
git commit -m "update: 시간표 및 등교/급식지도 최신화" > nul 2>&1

echo.
echo [3/3] GitHub로 업로드(Push) 진행 중...
echo --------------------------------------------------------
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  🎉 GitHub 배포가 성공적으로 완료되었습니다!
    echo ========================================================
    echo  공식 웹페이지 주소: https://shinukhang.github.io/timetable/
    echo  (약 1분 뒤 인터넷에 실시간 반영됩니다)
    echo ========================================================
    echo.
) else (
    echo.
    echo [안내] 원격 저장소 연결 재시도 중...
    git remote remove origin > nul 2>&1
    git remote add origin https://github.com/ShinUkhang/timetable.git
    git push -u origin main
)

pause

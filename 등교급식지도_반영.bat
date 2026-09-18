@echo off
chcp 65001 > nul
echo ========================================================
echo    🏫 등교·급식지도 엑셀 ➡️ 웹앱(index.html) 동기화
echo ========================================================
echo.
echo '등교급식지도' 폴더 안의 엑셀 파일들을 읽는 중입니다...
echo.

node update_duty.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [성공] 등교·급식지도 데이터가 index.html에 정상 반영되었습니다!
    echo.
    echo 💡 인터넷(GitHub)에도 바로 배포하려면 [실시간_업데이트.bat]를 실행하세요!
    echo.
    set /p OPEN_NOW="👉 브라우저에서 바로 확인하시겠습니까? (Y/N, 기본: Y): "
    if /i "%OPEN_NOW%"=="" set OPEN_NOW=Y
    if /i "%OPEN_NOW%"=="Y" start index.html
) else (
    echo.
    echo [오류] 엑셀 파싱 중 문제가 발생했습니다. Node.js 설치 상태를 확인해주세요.
    pause
)

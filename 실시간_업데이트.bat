@echo off
chcp 65001 > nul
title 🏫 배화여고 시간표 · 등교급식지도 · 행사 실시간 원클릭 업데이트

echo.
echo ================================================================
echo    🏫 배화여고 스마트 시간표 ^& 등교·급식·야자 ^& 행사 실시간 업데이트
echo ================================================================
echo.
echo  이 작업은 아래의 과정을 한번에 자동으로 처리합니다:
echo   1. '등교급식지도' 엑셀 및 구글 스프레드시트 야자감독 최신 데이터 동기화
echo   2. '행사' 폴더 내 최신 단축수업 공문/사진 웹앱 연동
echo   3. 웹앱(index.html) 데이터 갱신 및 파일 준비
echo   4. GitHub Pages로 자동 실시간 배포 (인터넷 업로드)
echo.
echo ----------------------------------------------------------------
echo.

echo [1/3] 📊 등교·급식지도 및 행사 최신 데이터 동기화 중...
node update_duty.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ [오류] 데이터 동기화 중 문제가 발생했습니다. Node.js 설치 상태를 확인해주세요.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] 💾 변경된 파일 자동 커밋 준비 중...
git add .
set COMMIT_TIME=%date% %time%
git commit -m "update: 등교급식지도 및 행사 실시간 업데이트 (%COMMIT_TIME%)" > nul 2>&1

echo.
echo [3/3] 🚀 GitHub 인터넷 서버로 실시간 업로드(Push) 중...
echo ----------------------------------------------------------------
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================================
    echo  🎉 실시간 업데이트 및 인터넷 배포가 성공적으로 완료되었습니다!
    echo ================================================================
    echo  👉 공식 웹페이지 주소: https://shinukhang.github.io/timetable/
    echo  (GitHub 서버 특성상 약 1~2분 뒤 인터넷에 실시간 반영됩니다)
    echo ================================================================
    echo.
    set /p OPEN_WEB="🌐 지금 웹 브라우저에서 바로 확인하시겠습니까? (Y/N, 기본: Y): "
    if /i "%OPEN_WEB%"=="" set OPEN_WEB=Y
    if /i "%OPEN_WEB%"=="Y" start https://shinukhang.github.io/timetable/
) else (
    echo.
    echo ⚠️ [안내] GitHub 푸시 재시도 중...
    git remote remove origin > nul 2>&1
    git remote add origin https://github.com/ShinUkhang/timetable.git
    git push -u origin main
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo 🎉 GitHub 재시도 배포 성공!
        echo 👉 웹페이지 주소: https://shinukhang.github.io/timetable/
    ) else (
        echo.
        echo ❌ [오류] 인터넷 업로드에 실패했습니다. 네트워크 연결 상태를 확인해주세요.
    )
    pause
)

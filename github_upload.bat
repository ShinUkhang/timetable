@echo off
chcp 65001 > nul
echo ========================================================
echo    🏫 배화여고 스마트 시간표 GitHub 원클릭 업로드 도우미
echo ========================================================
echo.
echo 1. GitHub (https://github.com) 에서 새 저장소(New repository)를 만드셨나요?
echo 2. 생성된 저장소 주소를 복사해 주세요.
echo    (예: https://github.com/your-name/timetable.git)
echo.
set /p REPO_URL="👉 저장소(Repository) 주소를 입력하세요: "

if "%REPO_URL%"=="" (
    echo.
    echo [오류] 주소가 입력되지 않았습니다. 프로그램을 종료합니다.
    pause
    exit /b
)

echo.
echo --------------------------------------------------------
echo [1/3] 원격 저장소 연결 중...
git remote remove origin > nul 2>&1
git remote add origin %REPO_URL%

echo [2/3] 최신 변경 사항 커밋 확인 중...
git add .
git commit -m "update: 시간표 및 기능 업데이트" > nul 2>&1

echo [3/3] GitHub로 업로드(Push) 진행 중...
echo (최초 1회 GitHub 로그인 창 또는 브라우저 인증이 나타날 수 있습니다)
echo --------------------------------------------------------
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  🎉 GitHub 업로드가 성공적으로 완료되었습니다!
    echo ========================================================
    echo.
    echo [다음 단계 안내]
    echo 1. GitHub 저장소 페이지의 [Settings] 클릭
    echo 2. 왼쪽 메뉴에서 [Pages] 클릭
    echo 3. Branch를 'main'으로 선택하고 [Save] 클릭!
    echo 4. 약 1~2분 뒤 배포된 공식 인터넷 링크가 나타납니다.
    echo.
) else (
    echo.
    echo [오류] 업로드 중 문제가 발생했습니다.
    echo 인터넷 연결 또는 GitHub 권한/로그인 상태를 확인해 주세요.
    echo.
)

pause

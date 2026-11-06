// 교직원 좌석·연락처 바탕화면 JPG 만들기
// index.html?wallpaper=1&static=1 화면을 Chrome(또는 Edge)으로 3840×2160(1920×1080의 2배)으로 찍어 JPG로 저장한다.
// 사용: node make_wallpaper.js   → wallpaper/staff_seats.jpg
// 좌석·내선이 바뀌면 index.html 의 seatLayoutSections / homeroomClassList 를 고친 뒤 다시 실행하면 된다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const BROWSERS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) {
    console.error('Chrome 또는 Edge 를 찾지 못했습니다.');
    process.exit(1);
}

const outDir = path.join(__dirname, 'wallpaper');
fs.mkdirSync(outDir, { recursive: true });
const png = path.join(outDir, 'staff_seats.png');
const jpg = path.join(outDir, 'staff_seats.jpg');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href + '?wallpaper=1&static=1';

console.log('바탕화면 화면을 찍는 중...');
execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--window-size=1920,1080', '--force-device-scale-factor=2', '--virtual-time-budget=8000',
    `--screenshot=${png}`, url
], { stdio: 'ignore' });

// PNG → JPG (Windows 기본 그래픽 라이브러리, 품질 92)
const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${png.replace(/'/g, "''")}')
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
$img.Save('${jpg.replace(/'/g, "''")}', $codec, $params)
$img.Dispose()`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
fs.unlinkSync(png);
console.log(`완료: ${jpg}`);

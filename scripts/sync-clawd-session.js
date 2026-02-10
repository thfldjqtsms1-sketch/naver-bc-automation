/**
 * clawd 브라우저 쿠키 → naver-session.json 동기화
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const CLAWD_COOKIES_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.clawdbot', 'browser', 'clawd', 'user-data', 'Default', 'Network', 'Cookies'
);
const SESSION_PATH = path.join(__dirname, '..', 'playwright', 'storage', 'naver-session.json');

// Chromium epoch (1601-01-01) to Unix epoch offset in microseconds
const CHROMIUM_EPOCH_OFFSET = 11644473600000000n;

function chromiumToUnix(chromiumTime) {
  if (!chromiumTime || chromiumTime === 0) return -1;
  // Chromium stores time in microseconds since 1601-01-01
  const unixMicro = BigInt(chromiumTime) - CHROMIUM_EPOCH_OFFSET;
  return Number(unixMicro) / 1000000;
}

function sameSiteToString(value) {
  switch(value) {
    case -1: return 'None';
    case 0: return 'None'; 
    case 1: return 'Lax';
    case 2: return 'Strict';
    default: return 'Lax';
  }
}

async function main() {
  console.log('🔄 clawd 브라우저 쿠키 동기화 시작...\n');
  
  if (!fs.existsSync(CLAWD_COOKIES_PATH)) {
    console.error('❌ clawd 쿠키 파일 없음:', CLAWD_COOKIES_PATH);
    process.exit(1);
  }

  // Copy to temp file (Chromium locks the original)
  const tempPath = path.join(__dirname, 'temp_cookies.db');
  fs.copyFileSync(CLAWD_COOKIES_PATH, tempPath);
  
  const db = new Database(tempPath, { readonly: true });
  
  // Get naver.com related cookies
  const cookies = db.prepare(`
    SELECT 
      name, value, host_key as domain, path, 
      expires_utc, is_httponly, is_secure, samesite,
      is_persistent
    FROM cookies 
    WHERE host_key LIKE '%naver.com' OR host_key LIKE '%naver%'
  `).all();
  
  db.close();
  fs.unlinkSync(tempPath);
  
  console.log(`📦 네이버 쿠키 ${cookies.length}개 발견\n`);
  
  // Convert to Playwright format
  const playwrightCookies = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: chromiumToUnix(c.expires_utc),
    httpOnly: c.is_httponly === 1,
    secure: c.is_secure === 1,
    sameSite: sameSiteToString(c.samesite)
  }));
  
  // Check for important cookies
  const hasNidAut = playwrightCookies.some(c => c.name === 'NID_AUT');
  const hasNidSes = playwrightCookies.some(c => c.name === 'NID_SES');
  
  console.log(`🔐 NID_AUT: ${hasNidAut ? '✅' : '❌'}`);
  console.log(`🔐 NID_SES: ${hasNidSes ? '✅' : '❌'}`);
  
  if (!hasNidAut || !hasNidSes) {
    console.log('\n⚠️ 로그인 쿠키가 없습니다. clawd 브라우저에서 먼저 로그인하세요.');
    process.exit(1);
  }
  
  // Save to session file
  const storageState = {
    cookies: playwrightCookies,
    origins: []
  };
  
  // Ensure directory exists
  const dir = path.dirname(SESSION_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(SESSION_PATH, JSON.stringify(storageState, null, 2));
  console.log(`\n✅ 세션 저장 완료: ${SESSION_PATH}`);
  console.log(`   쿠키 ${playwrightCookies.length}개`);
  
  // Also backup to .env
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const base64Session = Buffer.from(JSON.stringify(storageState)).toString('base64');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    envContent = envContent.replace(/^NAVER_SESSION_BACKUP=.*$/m, '').trim();
    envContent += `\nNAVER_SESSION_BACKUP="${base64Session}"`;
    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log('   .env 백업 완료');
  }
}

main().catch(console.error);

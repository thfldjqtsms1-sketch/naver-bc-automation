/**
 * 현재 세션을 .env에 백업
 */
const fs = require('fs');
const path = require('path');

const sessionPath = path.join(__dirname, '..', 'playwright', 'storage', 'naver-session.json');
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(sessionPath)) {
  const sessionData = fs.readFileSync(sessionPath, 'utf-8');
  const base64Session = Buffer.from(sessionData).toString('base64');
  
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  
  // 기존 NAVER_SESSION_BACKUP 제거
  envContent = envContent.replace(/^NAVER_SESSION_BACKUP=.*$/m, '').trim();
  
  // 새 백업 추가
  envContent += `\nNAVER_SESSION_BACKUP="${base64Session}"`;
  
  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('✅ 현재 세션을 .env에 백업 완료');
} else {
  console.log('❌ 세션 파일 없음:', sessionPath);
}

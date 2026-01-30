/**
 * 네이버 수동 로그인 스크립트
 * 사용법: npm run login
 * 
 * 브라우저에서 로그인 후 브라우저를 닫으면 자동으로 세션이 저장됩니다.
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as fs from "fs";
import * as path from "path";

// Stealth 플러그인 적용 (봇 감지 우회)
chromium.use(StealthPlugin());

const STORAGE_PATH = path.join(process.cwd(), "playwright", "storage");
const SESSION_FILE = path.join(STORAGE_PATH, "naver-session.json");

// 폴더가 없으면 생성
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

async function main() {
  console.log("=".repeat(50));
  console.log("네이버 블로그 자동화 - 로그인 설정");
  console.log("=".repeat(50));
  console.log("");
  console.log("📌 사용 방법:");
  console.log("   1. 열리는 브라우저에서 네이버 로그인");
  console.log("   2. 로그인 완료 후 브라우저 창을 닫기 (X 버튼)");
  console.log("   3. 자동으로 세션이 저장됩니다!");
  console.log("");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
  });

  const page = await context.newPage();
  
  // 네이버 로그인 페이지로 이동
  await page.goto("https://nid.naver.com/nidlogin.login");

  console.log("✅ 브라우저가 열렸습니다.");
  console.log("📝 로그인 후 브라우저 창을 닫아주세요...");
  console.log("");

  // 브라우저가 닫힐 때까지 대기
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => {
      resolve();
    });
  });

  // 세션 저장 (브라우저가 닫히기 전에 저장해야 함)
  // 위 방식은 동작하지 않으므로 다른 방식 사용
}

// 다른 접근 방식: 페이지 이벤트 감지
async function mainV2() {
  console.log("=".repeat(50));
  console.log("네이버 블로그 자동화 - 로그인 설정");
  console.log("=".repeat(50));
  console.log("");
  console.log("📌 사용 방법:");
  console.log("   1. 열리는 브라우저에서 네이버 로그인");
  console.log("   2. 로그인 완료되면 자동 감지됩니다");
  console.log("   3. 세션 저장 후 브라우저가 자동으로 닫힙니다");
  console.log("");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ko-KR",
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  
  // 봇 감지 우회 스크립트 (문자열로 전달)
  await page.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  `);
  
  // 네이버 로그인 페이지로 이동
  await page.goto("https://nid.naver.com/nidlogin.login");

  console.log("✅ 브라우저가 열렸습니다.");
  console.log("📝 네이버에 로그인해주세요...");
  console.log("   (로그인 완료 감지 중...)");
  console.log("");

  // 로그인 성공 감지: URL 변경 또는 특정 요소 감지
  let isLoggedIn = false;
  let checkCount = 0;
  const maxChecks = 300; // 최대 5분 대기 (1초 * 300)

  while (!isLoggedIn && checkCount < maxChecks) {
    await new Promise((r) => setTimeout(r, 1000));
    checkCount++;

    try {
      // 현재 URL 확인
      const currentUrl = page.url();
      
      // 로그인 성공 후 리다이렉트 감지
      if (currentUrl.includes("naver.com") && !currentUrl.includes("nidlogin")) {
        // 추가 확인: 네이버 메인이나 다른 페이지로 이동했는지
        isLoggedIn = true;
        console.log("🔍 로그인 감지됨! 확인 중...");
      }
      
      // 로그인 페이지에서 성공 메시지나 리다이렉트 감지
      if (currentUrl.includes("finalize") || currentUrl.includes("callback")) {
        isLoggedIn = true;
      }
    } catch {
      // 페이지가 닫혔을 수 있음
      break;
    }
  }

  if (isLoggedIn) {
    // 블로그 페이지로 이동하여 최종 확인
    console.log("🔄 로그인 상태 최종 확인 중...");
    
    try {
      await page.goto("https://blog.naver.com/", { waitUntil: "domcontentloaded", timeout: 10000 });
      await new Promise((r) => setTimeout(r, 2000));
      
      // 세션 저장
      await context.storageState({ path: SESSION_FILE });
      console.log("");
      console.log("✅ 세션이 저장되었습니다!");
      console.log(`   📁 저장 위치: ${SESSION_FILE}`);
      console.log("");
      console.log("🎉 이제 자동화가 이 세션을 사용합니다.");
      console.log("   세션은 보통 7~30일간 유지됩니다.");
    } catch (error) {
      console.log("⚠️ 페이지 이동 중 오류, 현재 상태로 세션 저장...");
      await context.storageState({ path: SESSION_FILE });
      console.log("✅ 세션이 저장되었습니다!");
    }
  } else {
    console.log("⏱️ 시간 초과 또는 로그인이 감지되지 않았습니다.");
    console.log("   현재 상태로 세션을 저장합니다...");
    
    try {
      await context.storageState({ path: SESSION_FILE });
      console.log("✅ 세션이 저장되었습니다!");
    } catch {
      console.log("❌ 세션 저장 실패");
    }
  }

  await browser.close();
  console.log("\n프로그램을 종료합니다.");
  process.exit(0);
}

mainV2().catch((error) => {
  console.error("오류 발생:", error);
  process.exit(1);
});

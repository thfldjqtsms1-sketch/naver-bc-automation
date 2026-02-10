/**
 * 심플 에이전트 - 단순하게 동작하는 버전
 * 한 단계씩 확인하며 진행
 */

import "dotenv/config";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// ============================================
// OAuth Claude 설정 (캡차 풀이용)
// ============================================
const claudeCodeVersion = "2.1.2";
const AUTH_PROFILES_PATH = path.join(os.homedir(), ".clawdbot", "agents", "main", "agent", "auth-profiles.json");

function loadClaudeToken(): string | null {
  try {
    const content = fs.readFileSync(AUTH_PROFILES_PATH, "utf8");
    const profiles = JSON.parse(content);
    const oauthCred = profiles?.profiles?.["anthropic:claude-cli"];
    if (oauthCred && oauthCred.type === "oauth" && Date.now() <= oauthCred.expires - 5 * 60 * 1000) {
      return oauthCred.access;
    }
    const manualCred = profiles?.profiles?.["anthropic:manual"];
    if (manualCred && manualCred.type === "token" && manualCred.token) {
      return manualCred.token;
    }
  } catch {}
  return process.env.ANTHROPIC_API_KEY || null;
}

function createClaudeClient(token: string): Anthropic {
  return new Anthropic({
    apiKey: null as any,
    authToken: token,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "user-agent": `claude-cli/${claudeCodeVersion}`,
      "x-app": "cli",
    },
  });
}

// ============================================
// Captcha Exchange 경로
// ============================================
const CAPTCHA_EXCHANGE_DIR = path.join(process.cwd(), "captcha_exchange");

// captcha_exchange 폴더 초기화
function initCaptchaExchange() {
  if (!fs.existsSync(CAPTCHA_EXCHANGE_DIR)) {
    fs.mkdirSync(CAPTCHA_EXCHANGE_DIR, { recursive: true });
  }
  // 이전 파일들 정리
  const files = ["captcha_image.png", "captcha_question.txt", "captcha_answer.txt"];
  files.forEach(f => {
    const p = path.join(CAPTCHA_EXCHANGE_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

// ============================================
// 자동 로그인 (세션 만료 시)
// ============================================
async function autoLogin(page: Page): Promise<boolean> {
  const naverId = process.env.NAVER_ID;
  const naverPw = process.env.NAVER_PW;
  
  if (!naverId || !naverPw) {
    console.log("   ❌ .env에 NAVER_ID, NAVER_PW 없음");
    return false;
  }
  
  console.log("   🔐 자동 로그인 시도 중...");
  
  try {
    // 로그인 페이지로 이동
    await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    
    // 아이디 입력
    const idInput = await page.$('input[name="id"], input#id');
    if (idInput) {
      await idInput.fill(naverId);
      await page.waitForTimeout(500);
    }
    
    // 비밀번호 입력
    const pwInput = await page.$('input[name="pw"], input#pw, input[type="password"]');
    if (pwInput) {
      await pwInput.fill(naverPw);
      await page.waitForTimeout(500);
    }
    
    // 로그인 버튼 클릭
    const loginBtn = await page.$('button:has-text("로그인"), button.btn_login');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(3000);
    }
    
    // 캡차 체크
    const pageText = await page.textContent('body').catch(() => '');
    if (pageText?.includes('보안 확인') || pageText?.includes('빈 칸을 채워주세요')) {
      console.log("   ⚠️ 로그인 중 캡차 발생! captcha_exchange로 처리...");
      const solved = await solveCaptchaViaExchange(page);
      if (!solved) return false;
    }
    
    // 로그인 성공 확인
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin')) {
      console.log("   ❌ 로그인 실패 (아직 로그인 페이지)");
      return false;
    }
    
    console.log("   ✅ 자동 로그인 성공!");
    
    // 세션 저장
    const context = page.context();
    const sessionPath = path.join(process.cwd(), "playwright", "storage", "naver-session.json");
    await context.storageState({ path: sessionPath });
    console.log("   💾 세션 저장 완료");
    
    return true;
  } catch (error) {
    console.log("   ❌ 자동 로그인 오류:", error);
    return false;
  }
}

// ============================================
// 캡차 풀이 (captcha_exchange 방식 - Clawdbot 연동)
// ============================================
async function solveCaptchaViaExchange(page: Page): Promise<boolean> {
  initCaptchaExchange();
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`   🔄 캡차 풀이 시도 ${attempt}/3 (captcha_exchange 방식)`);
    
    try {
      // 1. 질문 추출
      let questionText = "";
      const questionEl = await page.$('p:has-text("[?]"), span:has-text("[?]"), div:has-text("빈 칸")');
      if (questionEl) {
        questionText = await questionEl.textContent() || "";
      }
      
      // 2. 스크린샷 저장
      const imagePath = path.join(CAPTCHA_EXCHANGE_DIR, "captcha_image.png");
      await page.screenshot({ path: imagePath, fullPage: false });
      
      // 3. 질문 저장
      const questionPath = path.join(CAPTCHA_EXCHANGE_DIR, "captcha_question.txt");
      fs.writeFileSync(questionPath, questionText || "이미지에서 질문 확인");
      
      console.log(`   📸 캡차 저장: ${CAPTCHA_EXCHANGE_DIR}`);
      console.log(`   📋 질문: ${questionText}`);
      console.log("   ⏳ 답변 대기 중... (captcha_answer.txt)");
      
      // 4. 답변 파일 대기 (최대 120초)
      const answerPath = path.join(CAPTCHA_EXCHANGE_DIR, "captcha_answer.txt");
      let answer = "";
      for (let i = 0; i < 60; i++) { // 2초 * 60 = 120초
        await page.waitForTimeout(2000);
        if (fs.existsSync(answerPath)) {
          answer = fs.readFileSync(answerPath, "utf-8").trim();
          if (answer) break;
        }
      }
      
      if (!answer) {
        console.log("   ⏰ 답변 시간 초과");
        continue;
      }
      
      console.log(`   ✏️ 답변 입력: ${answer}`);
      
      // 5. 답변 입력
      const inputField = await page.$('input[type="text"], input[name="answer"]');
      if (inputField) {
        await inputField.fill(answer);
        await page.waitForTimeout(500);
      }
      
      // 6. 확인 버튼 클릭
      const confirmBtn = await page.$('button:has-text("확인"), button[type="submit"]');
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
      
      // 7. 캡차 통과 확인
      const newPageText = await page.textContent('body').catch(() => '');
      if (!newPageText?.includes('보안 확인') && !newPageText?.includes('빈 칸을 채워주세요')) {
        console.log("   ✅ 캡차 통과!");
        // 파일 정리
        initCaptchaExchange();
        return true;
      }
      
      console.log("   ❌ 캡차 실패, 재시도...");
      initCaptchaExchange(); // 파일 정리 후 재시도
      
    } catch (error) {
      console.log("   ❌ 캡차 처리 오류:", error);
    }
  }
  
  return false;
}

// ============================================
// 캡차 감지 및 풀이 (Claude Vision) - 네이버 이미지 문제 형식
// ============================================
async function checkAndSolveCaptcha(page: Page): Promise<boolean> {
  const url = page.url();
  const pageText = await page.textContent('body').catch(() => '');
  
  // 로그인 페이지 감지 (캡차가 아님!)
  const isLoginPage = url.includes('nidlogin') || 
                      pageText?.includes('아이디 또는 전화번호') ||
                      pageText?.includes('로그인 상태 유지');
  
  if (isLoginPage) {
    console.log("   ⚠️ 로그인 세션 만료! 자동 로그인 시도...");
    const loggedIn = await autoLogin(page);
    if (!loggedIn) {
      throw new Error("네이버 로그인 실패 - npm run login 실행하세요");
    }
    return true; // 로그인 성공, 재시도 필요
  }
  
  // 캡차 페이지 감지 ("보안 확인" + 영수증/이미지 문제)
  const isCaptchaPage = pageText?.includes('보안 확인') || 
                        pageText?.includes('빈 칸을 채워주세요') ||
                        pageText?.includes('캡차');
  
  if (!isCaptchaPage) {
    return true; // 캡차 없음, 정상
  }
  
  console.log("   ⚠️ 네이버 보안 확인(캡차) 페이지 감지!");
  
  // Vision API 가능 여부 체크 (OpenAI 또는 Gemini 키 필요)
  const hasVisionAPI = !!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY;
  
  if (!hasVisionAPI) {
    console.log("   ⚠️ Vision API 키 없음 - captcha_exchange 방식으로 전환");
    return await solveCaptchaViaExchange(page);
  }
  
  const token = loadClaudeToken();
  const claude = token ? createClaudeClient(token) : null;
  
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`   🔄 캡차 풀이 시도 ${attempt}/5`);
    
    try {
      // 질문 텍스트 추출 (영수증의 가게 위치는 가구길 [?] 입니다 등)
      let questionText = "";
      const questionEl = await page.$('p:has-text("[?]"), span:has-text("[?]"), div:has-text("빈 칸을 채워주세요")');
      if (questionEl) {
        questionText = await questionEl.textContent() || "";
      }
      console.log(`   📋 질문: ${questionText}`);
      
      // 캡차 이미지 스크린샷 (전체 페이지)
      const screenshotPath = path.join(process.cwd(), "temp_images", `captcha_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      
      // Base64 인코딩
      const imageData = fs.readFileSync(screenshotPath).toString("base64");
      
      // Vision API로 이미지 분석 (OpenAI > Gemini 순서)
      let captchaResponse = "";
      
      const visionPrompt = `이 네이버 보안 캡차 이미지에서 영수증/문서를 읽어.
                
질문: "${questionText || '이미지에서 질문 확인'}"

규칙: 질문의 [?]에 해당하는 숫자만 출력. 설명 없이 숫자만!

정답:`;
      
      // 1. OpenAI Vision 시도
      if (process.env.OPENAI_API_KEY && !captchaResponse) {
        try {
          const openaiVision = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const visionResult = await openaiVision.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 50,
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:image/png;base64,${imageData}` } },
                { type: "text", text: visionPrompt }
              ]
            }]
          });
          captchaResponse = visionResult.choices[0]?.message?.content || "";
          console.log(`   🤖 OpenAI Vision 사용`);
        } catch (e: any) {
          console.log(`   ⚠️ OpenAI Vision 실패: ${e.message}`);
        }
      }
      
      // 2. Gemini Vision 시도
      if (process.env.GEMINI_API_KEY && !captchaResponse) {
        try {
          const geminiVision = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = geminiVision.getGenerativeModel({ model: "gemini-2.0-flash" });
          const result = await model.generateContent([
            { inlineData: { mimeType: "image/png", data: imageData } },
            visionPrompt
          ]);
          captchaResponse = result.response.text() || "";
          console.log(`   🤖 Gemini Vision 사용`);
        } catch (e: any) {
          console.log(`   ⚠️ Gemini Vision 실패: ${e.message}`);
        }
      }
      
      // 숫자만 추출 (첫번째 연속 숫자)
      const numMatch = captchaResponse.match(/\d+/);
      let captchaAnswer = numMatch ? numMatch[0] : captchaResponse.replace(/[^\d]/g, '');
      console.log(`   📝 캡차 정답: "${captchaAnswer}"`);
      
      if (!captchaAnswer) {
        console.log(`   ⚠️ 정답 추출 실패`);
        // 새로고침 버튼 클릭해서 새 문제 받기
        const refreshBtn = await page.$('button:has-text("새로고침")');
        if (refreshBtn) await refreshBtn.click();
        await page.waitForTimeout(2000);
        continue;
      }
      
      // 캡차 입력 필드 찾기 & 입력
      const inputSelectors = [
        'input[placeholder*="정답"]',
        'input[placeholder*="입력"]',
        'input[type="text"]',
      ];
      
      let inputFound = false;
      for (const selector of inputSelectors) {
        const input = await page.$(selector);
        if (input && await input.isVisible()) {
          await input.fill('');  // 기존 내용 지우기
          await input.fill(captchaAnswer);
          console.log(`   ✅ 정답 입력: ${captchaAnswer}`);
          inputFound = true;
          break;
        }
      }
      
      if (!inputFound) {
        console.log(`   ⚠️ 입력 필드 못 찾음`);
        continue;
      }
      
      await page.waitForTimeout(500);
      
      // 확인 버튼 클릭
      const submitBtn = await page.$('button:has-text("확인")');
      if (submitBtn && await submitBtn.isVisible()) {
        await submitBtn.click();
        console.log(`   🔘 확인 버튼 클릭`);
      }
      
      await page.waitForTimeout(3000);
      
      // 스크린샷 파일 정리
      try { fs.unlinkSync(screenshotPath); } catch {}
      
      // 캡차 해결됐는지 확인
      const newUrl = page.url();
      const newText = await page.textContent('body').catch(() => '');
      if (!newUrl.includes('nid.naver.com') && !newText?.includes('보안 확인')) {
        console.log(`   ✅ 캡차 해결 성공!`);
        return true;
      }
      
      // 오류 메시지 확인
      const errorMsg = await page.$('text=정답이 아닙니다, text=다시 시도');
      if (errorMsg) {
        console.log(`   ❌ 오답, 새 문제로 재시도...`);
        const refreshBtn = await page.$('button:has-text("새로고침")');
        if (refreshBtn) await refreshBtn.click();
        await page.waitForTimeout(2000);
      }
      
    } catch (e: any) {
      console.log(`   ⚠️ 캡차 풀이 오류: ${e.message}`);
    }
  }
  
  console.log("   ❌ 캡차 5회 실패. 수동 해결 필요 (60초 대기)...");
  await page.waitForTimeout(60000);
  return !page.url().includes('nid.naver.com');
}

// Stealth 플러그인 적용 (봇 감지 우회)
chromium.use(StealthPlugin());

const prisma = new PrismaClient();

// AI Provider 설정 (openai, gemini, 또는 oauth)
const AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

// OpenAI 초기화
const openai = AI_PROVIDER === "openai" 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

// Gemini 초기화
const gemini = AI_PROVIDER === "gemini" 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")
  : null;

// OAuth (Claude) 설정 - clawdbot 토큰 우선 사용
let oauthClient: Anthropic | null = null;
if (AI_PROVIDER === "oauth") {
  // clawdbot 토큰 우선 (Claude Code 방식으로 동작)
  const token = loadClaudeToken();
  if (token) {
    oauthClient = createClaudeClient(token);
    console.log("✅ OAuth (Claude) 클라이언트 초기화 완료 (clawdbot 토큰)");
  } else {
    console.log("⚠️ OAuth 토큰 없음 - clawdbot 실행 필요");
  }
}

const SESSION_FILE = path.join(process.cwd(), "playwright", "storage", "naver-session.json");
const TEMP_PATH = path.join(process.cwd(), "temp_images");
const NAVER_BLOG_ID = process.env.NAVER_BLOG_ID || "";

if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });

// ============================================
// STEP 1: 상품 페이지에서 상품 정보 + 이미지 추출
// ============================================
interface ProductInfo {
  name: string;
  description: string;
  features: string[];
  price: string;
  originalPrice: string;      // 원가 (할인 전 가격)
  discountRate: string;       // 할인율 (예: "30%")
  couponInfo: string;         // 쿠폰 정보
  deliveryInfo: string;       // 배송 정보 (무료배송 등)
  reviewCount: string;        // 리뷰 수
  rating: string;             // 평점
  imagePaths: string[];
}

async function step1_getProductInfo(page: Page, url: string): Promise<ProductInfo> {
  console.log("\n📦 STEP 1: 상품 정보 수집");
  
  await page.goto(url, { timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 캡차 체크 및 해결
  const captchaSolved = await checkAndSolveCaptcha(page);
  if (!captchaSolved) {
    throw new Error("캡차 해결 실패 - 수동 확인 필요");
  }
  
  // 캡차 후 원래 URL로 다시 이동 (리다이렉트 됐을 수 있음)
  if (!page.url().includes('smartstore') && !page.url().includes('shopping')) {
    console.log("   🔄 상품 페이지로 재이동...");
    await page.goto(url, { timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  
  await page.waitForTimeout(2000);
  
  // 1. 상품명 추출 (여러 방법 시도)
  let productName = "";
  
  try {
    // og:title에서 추출
    const ogTitle = await page.$('meta[property="og:title"]');
    if (ogTitle) {
      const content = await ogTitle.getAttribute('content');
      if (content) productName = content.split(':')[0].split('-')[0].trim();
    }
  } catch (e: any) {
    if (e.message.includes('context') || e.message.includes('destroyed') || e.message.includes('navigation')) {
      console.log("   ⚠️ 페이지 변경 감지, 캡차 재확인...");
      const resolved = await checkAndSolveCaptcha(page);
      if (!resolved) throw new Error("캡차 해결 실패");
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(3000);
    }
  }
  
  // 페이지 내 상품명 요소에서 추출 (더 정확) - try-catch로 context 에러 처리
  const nameSelectors = [
    '._3oDjSvLwEZ',           // 스마트스토어 상품명
    '.product_title',
    'h2._22kNQuEXmb',
    '[class*="product_title"]',
    '[class*="ProductName"]',
  ];
  
  for (const selector of nameSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = await el.textContent();
      if (text && text.length > 3) {
        productName = text.trim();
        break;
      }
    }
  }
  
  if (!productName) {
    productName = (await page.title()).split(':')[0].split('-')[0].trim();
  }
  console.log(`   📌 상품명: ${productName}`);
  
  // 2. 상품 설명 추출
  let description = "";
  const descSelectors = [
    '._1s2eOHMQjt',           // 스마트스토어 상품 설명
    '.product_detail_description',
    '[class*="description"]',
    'meta[property="og:description"]',
  ];
  
  for (const selector of descSelectors) {
    if (selector.startsWith('meta')) {
      const meta = await page.$(selector);
      if (meta) {
        description = await meta.getAttribute('content') || "";
        break;
      }
    } else {
      const el = await page.$(selector);
      if (el) {
        description = (await el.textContent())?.trim() || "";
        if (description.length > 10) break;
      }
    }
  }
  console.log(`   📝 설명: ${description.substring(0, 50)}...`);
  
  // 3. 상품 특징/키워드 추출
  const features: string[] = [];
  const featureEls = await page.$$('[class*="benefit"], [class*="feature"], [class*="spec"] li');
  for (const el of featureEls.slice(0, 5)) {
    const text = await el.textContent();
    if (text && text.length > 3 && text.length < 50) {
      features.push(text.trim());
    }
  }
  console.log(`   ✨ 특징: ${features.length}개`);
  
  // 4. 가격 추출
  let price = "";
  const priceSelectors = ['._1LY7DqCnwR', '.total_price', '[class*="price"]:not([class*="original"])'];
  for (const selector of priceSelectors) {
    const el = await page.$(selector);
    if (el) {
      price = (await el.textContent())?.trim() || "";
      if (price.includes('원')) break;
    }
  }
  console.log(`   💰 가격: ${price}`);

  // 4-1. 원가 (할인 전 가격) 추출
  let originalPrice = "";
  const originalPriceSelectors = [
    'del', 'strike', 
    '[class*="original"]', '[class*="before"]', 
    '._2DywKu0J_Y',  // 스마트스토어 원가
    '.price_del'
  ];
  for (const selector of originalPriceSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (text.includes('원') || /[\d,]+/.test(text)) {
        originalPrice = text;
        break;
      }
    }
  }
  if (originalPrice) console.log(`   💸 원가: ${originalPrice}`);

  // 4-2. 할인율 추출
  let discountRate = "";
  const discountSelectors = [
    '[class*="discount"]', '[class*="sale"]',
    '._2pgHN-ntx6',  // 스마트스토어 할인율
    '.discount_rate', '[class*="percent"]'
  ];
  for (const selector of discountSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (text.includes('%')) {
        discountRate = text.match(/\d+%/)?.[0] || text;
        break;
      }
    }
  }
  if (discountRate) console.log(`   🔥 할인율: ${discountRate}`);

  // 4-3. 쿠폰/혜택 정보 추출
  let couponInfo = "";
  const couponSelectors = [
    '[class*="coupon"]', '[class*="benefit"]',
    '[class*="naver_point"]', '[class*="npay"]',
    '._1zItxZRrZt',  // 스마트스토어 쿠폰
    '.benefit_info'
  ];
  const couponTexts: string[] = [];
  for (const selector of couponSelectors) {
    const els = await page.$$(selector);
    for (const el of els.slice(0, 3)) {
      const text = (await el.textContent())?.trim() || "";
      if (text && text.length > 2 && text.length < 100 && !couponTexts.includes(text)) {
        couponTexts.push(text);
      }
    }
  }
  couponInfo = couponTexts.join(' / ');
  if (couponInfo) console.log(`   🎁 쿠폰/혜택: ${couponInfo.substring(0, 50)}...`);

  // 4-4. 배송 정보 추출
  let deliveryInfo = "";
  const deliverySelectors = [
    '[class*="delivery"]', '[class*="shipping"]',
    '._2OAJPEG1R8',  // 스마트스토어 배송
    '.delivery_fee_info'
  ];
  for (const selector of deliverySelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (text && (text.includes('배송') || text.includes('무료') || text.includes('도착'))) {
        deliveryInfo = text.replace(/\s+/g, ' ').substring(0, 50);
        break;
      }
    }
  }
  if (deliveryInfo) console.log(`   🚚 배송: ${deliveryInfo}`);

  // 4-5. 리뷰 수 & 평점 추출
  let reviewCount = "";
  let rating = "";
  const reviewSelectors = [
    '[class*="review"]', '[class*="rating"]',
    '._2LvUD5PAiM',  // 스마트스토어 리뷰
    '.review_count'
  ];
  for (const selector of reviewSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      // 리뷰 수 추출 (숫자가 포함된 경우)
      const countMatch = text.match(/[\d,]+(?=\s*개|\s*건)?/);
      if (countMatch && !reviewCount) {
        reviewCount = countMatch[0];
      }
      // 평점 추출 (4.8 같은 형태)
      const ratingMatch = text.match(/\d\.\d/);
      if (ratingMatch && !rating) {
        rating = ratingMatch[0];
      }
    }
  }
  if (reviewCount) console.log(`   ⭐ 리뷰: ${reviewCount}개`);
  if (rating) console.log(`   ⭐ 평점: ${rating}`);
  
  // 5. 상품 이미지 URL 추출
  console.log("   🖼️ 이미지 URL 추출 중...");
  const imageUrls: string[] = [];
  
  const images = await page.$$('img');
  for (const img of images) {
    let src = await img.getAttribute('src');
    const dataSrc = await img.getAttribute('data-src');
    src = dataSrc || src;
    
    if (src && 
        (src.includes('shop-phinf.pstatic.net') || src.includes('shopping-phinf.pstatic.net')) &&
        !src.includes('icon') && !src.includes('logo') && !src.includes('1x1')) {
      const highRes = src.replace(/\?type=.*/, '?type=w860');
      if (!imageUrls.includes(highRes)) {
        imageUrls.push(highRes);
      }
    }
    if (imageUrls.length >= 15) break;  // 더 많이 수집
  }
  
  console.log(`   🖼️ ${imageUrls.length}개 이미지 발견`);
  
  // 이미지 다운로드 (최대 10개로 확대)
  const imagePaths: string[] = [];
  const downloadCount = Math.min(10, imageUrls.length);
  
  for (let i = 0; i < downloadCount; i++) {
    try {
      const imgPath = path.join(TEMP_PATH, `product_${Date.now()}_${i}.jpg`);
      await downloadImage(imageUrls[i], imgPath);
      imagePaths.push(imgPath);
      console.log(`   ✅ 이미지 ${i + 1}/${downloadCount} 다운로드`);
    } catch (e) {
      console.log(`   ⚠️ 다운로드 실패 ${i + 1}`);
    }
  }
  
  return {
    name: productName,
    description,
    features,
    price,
    originalPrice,
    discountRate,
    couponInfo,
    deliveryInfo,
    reviewCount,
    rating,
    imagePaths,
  };
}

// 이미지 다운로드 함수
async function downloadImage(url: string, filePath: string): Promise<void> {
  const https = await import('https');
  const http = await import('http');
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);
    
    protocol.get(url, (response: any) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl, filePath).then(resolve).catch(reject);
          return;
        }
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err: any) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

// ============================================
// AI 공통 호출 함수 (OpenAI / Gemini / OAuth)
// ============================================
async function generateWithAI(systemPrompt: string, userPrompt: string): Promise<string> {
  if (AI_PROVIDER === "oauth" && oauthClient) {
    // OAuth (Claude) 사용
    const model = process.env.OAUTH_MODEL || "claude-sonnet-4-20250514";
    console.log(`   🤖 Using OAuth model: ${model}`);
    
    const response = await oauthClient.messages.create({
      model,
      max_tokens: 4000,
      system: [
        { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude.", cache_control: { type: "ephemeral" } },
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }
      ],
      messages: [{ role: "user", content: userPrompt }]
    });
    
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
    
  } else if (AI_PROVIDER === "gemini" && gemini) {
    // Gemini 사용
    const model = gemini.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 4000,
      }
    });
    
    // Gemini는 system prompt를 user prompt에 합쳐서 전달
    const combinedPrompt = `[시스템 지시사항]\n${systemPrompt}\n\n[사용자 요청]\n${userPrompt}`;
    const result = await model.generateContent(combinedPrompt);
    return result.response.text();
    
  } else if (openai) {
    // OpenAI 사용
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",  // GPT-5.2 모델 사용
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.75,
      max_completion_tokens: 4000,
    });
    return response.choices[0]?.message?.content || "";
    
  } else {
    throw new Error("AI Provider가 설정되지 않았습니다. .env 파일을 확인하세요.");
  }
}

// ============================================
// STEP 2: LLM으로 SEO 최적화 글 생성 (긴 버전)
// ============================================
async function step2_generatePost(product: ProductInfo, brandLink: string): Promise<{ title: string; sections: string[]; hashtags: string[] }> {
  console.log("\n📝 STEP 2: SEO 최적화 블로그 글 생성 (확장판)");
  console.log(`   🤖 AI Provider: ${AI_PROVIDER.toUpperCase()}`);
  
  const imageCount = Math.max(product.imagePaths.length, 8);  // 최소 8섹션
  
  // 인트로 변화를 위한 랜덤 요소
  const intros = [
    "요즘 고민하다가 드디어 질렀어요",
    "궁금해서 바로 주문해봤어요", 
    "많이들 추천하셔서 저도 써봤어요",
    "오랫동안 찾던 제품을 드디어 발견했어요",
    "친구 추천으로 구매하게 됐어요"
  ];
  const randomIntro = intros[Math.floor(Math.random() * intros.length)];
  
  const endings = [
    "강력 추천드려요", "만족스러워요", "재구매 의사 있어요",
    "가성비 좋아요", "후회 없는 선택이에요"
  ];
  const randomEnding = endings[Math.floor(Math.random() * endings.length)];

  const systemPrompt = `당신은 인기 네이버 블로거입니다. 
- 친근하고 솔직한 ~요체 사용 (했어요, 같아요, 더라고요, 거든요)
- 상품을 정확히 이해하고 실제 사용한 것처럼 생생하게 작성
- SEO를 위해 상품명, 관련 키워드를 자연스럽게 본문에 포함
- 매번 조금씩 다른 표현 사용 (똑같은 문구 반복 금지)
- 과장 없이 신뢰감 있게 작성`;

  const userPrompt = `다음 상품의 상세 블로그 리뷰를 작성해주세요.

## 상품 정보
- 상품명: ${product.name}
- 설명: ${product.description || '(상품 설명 참고)'}
- 특징: ${product.features.join(', ') || '(상품 특징 참고)'}
- 가격: ${product.price || '(가격 정보 참고)'}
${product.originalPrice ? `- 원가: ${product.originalPrice}` : ''}
${product.discountRate ? `- 할인율: ${product.discountRate} 할인 중!` : ''}
${product.couponInfo ? `- 쿠폰/혜택: ${product.couponInfo}` : ''}
${product.deliveryInfo ? `- 배송: ${product.deliveryInfo}` : ''}
${product.reviewCount ? `- 리뷰: ${product.reviewCount}개` : ''}
${product.rating ? `- 평점: ${product.rating}점` : ''}

## 이번 글의 톤
- 인트로 힌트: "${randomIntro}"
- 마무리 힌트: "${randomEnding}"
- 이 힌트를 참고해서 자연스럽게 변형해서 사용

## 작성 규칙
1. 제목: 상품 카테고리 + 상품명 키워드 포함, 25-35자
   예: "아기비데 추천 | 해피달링 시그니처 워터탭 솔직 후기"

2. 본문을 ${imageCount}개 섹션으로 작성 (총 2000자 이상)

3. 각 섹션 구조:
   - 이모지 + 소제목 (한 줄)
   - 빈 줄
   - 본문 4-6문장 (각 문장 끝에 줄바꿈, 각 문장 30-50자)
   - 빈 줄

4. 섹션 구성 (${imageCount}개):
   - 🛒 구매하게 된 계기
   - 📦 택배 도착 & 개봉기
   - ✨ 첫인상 / 디자인
   - 📐 크기 & 스펙 정보
   - ⭐ 주요 기능 ①
   - ⭐ 주요 기능 ② 
   - 💡 실제 사용 후기
   - ✅ 장점 정리
   - ⚠️ 아쉬운 점 (솔직하게)
   - 🎯 이런 분께 추천해요

5. SEO 키워드 삽입:
   - 제목에 메인 키워드
   - 첫 문장에 상품명 포함
   - 본문 중간중간 관련 키워드 자연스럽게 배치

6. 할인/특가 정보 활용 (있는 경우만):
   - 할인율이 있으면 "🔥 지금 XX% 할인 중!", "특가 진행 중" 등 강조
   - 쿠폰 정보가 있으면 "쿠폰까지 챙기면 더 싸게!", "추가 할인 가능" 언급
   - 무료배송이면 "무료배송이라 부담 없어요" 등 언급
   - 리뷰 수가 많으면 "리뷰가 XXXX개나 되더라고요, 믿고 샀어요" 등 신뢰도 강조
   - 평점이 높으면 "평점 X.X점으로 검증된 제품" 등 언급
   - 이런 정보는 구매 유도 섹션이나 마무리 부분에서 자연스럽게 활용

7. 해시태그 20개:
   - 상품명 관련 (3개)
   - 카테고리 관련 (5개)  
   - 검색용 키워드 (7개): 추천, 후기, 리뷰, 비교, 순위, 가격, 장단점
   - 일반 태그 (5개): 일상, 육아템, 생활용품, 가성비 등

## 출력 (JSON만, 줄바꿈은 \\n)
{
  "title": "SEO 최적화 제목",
  "sections": [
    "🛒 소제목\\n\\n문장1.\\n문장2.\\n문장3.\\n문장4.\\n",
    "📦 소제목\\n\\n문장1.\\n문장2.\\n문장3.\\n"
  ],
  "hashtags": ["키워드1", "키워드2", ...]
}`;
  
  const text = await generateWithAI(systemPrompt, userPrompt);
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
  
  // 마지막에 필수 문구와 구매링크 추가 (링크 프리뷰가 문장을 끊지 않도록 순서 변경)
  const lastSection = `

이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.

👉 구매링크: ${brandLink}`;
  
  const sections = json.sections || [""];
  sections.push(lastSection);
  
  const totalLength = sections.reduce((sum: number, s: string) => sum + s.length, 0);
  console.log(`   📌 제목: ${json.title}`);
  console.log(`   📝 섹션: ${sections.length}개, 총 ${totalLength}자`);
  console.log(`   🏷️ 해시태그: ${(json.hashtags || []).length}개`);
  console.log(`      ${(json.hashtags || []).slice(0, 8).join(', ')}...`);
  
  return {
    title: json.title || product.name,
    sections: sections,
    hashtags: json.hashtags || []
  };
}

// ============================================
// STEP 3: 블로그 에디터 열기
// ============================================
async function step3_openEditor(page: Page): Promise<void> {
  console.log("\n📄 STEP 3: 블로그 글쓰기 페이지");
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`https://blog.naver.com/${NAVER_BLOG_ID}/postwrite`, { timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // 로그인/캡차 체크
    const currentUrl = page.url();
    const bodyText = await page.textContent('body').catch(() => '');
    
    // 로그인 페이지 체크
    if (currentUrl.includes('nidlogin') || bodyText?.includes('아이디 또는 전화번호')) {
      console.log("   ⚠️ 로그인 필요! 자동 로그인 시도...");
      const loggedIn = await autoLogin(page);
      if (!loggedIn) {
        throw new Error("네이버 로그인 실패 - npm run login 실행하세요");
      }
      continue; // 로그인 후 다시 시도
    }
    
    // 캡차 페이지 체크
    if (bodyText?.includes('보안 확인') || bodyText?.includes('빈 칸을 채워주세요')) {
      console.log(`   ⚠️ 캡차 발생 (시도 ${attempt}/3)`);
      const solved = await checkAndSolveCaptcha(page);
      if (!solved) {
        throw new Error("블로그 접근 시 캡차 해결 실패");
      }
      continue; // 캡차 풀고 다시 시도
    }
    
    // 에디터 페이지 확인
    await page.waitForTimeout(2000);
    const editorExists = await page.$('.se-documentTitle, .se-component-content, [class*="editor"]');
    if (!editorExists) {
      console.log(`   ⚠️ 에디터 로드 안됨, 재시도... (${attempt}/3)`);
      continue;
    }
    
    // 팝업 닫기 (작성 중인 글 있습니다)
    try {
      const cancelBtn = await page.$('.se-popup-button-cancel');
      if (cancelBtn) {
        await cancelBtn.click();
        console.log("   팝업 닫음");
        await page.waitForTimeout(1000);
      }
    } catch {}
    
    console.log("   ✅ 에디터 준비 완료");
    return;
  }
  
  throw new Error("블로그 에디터 로드 실패 (3회 시도)");
}

// ============================================
// STEP 4: 제목 입력
// ============================================
async function step4_inputTitle(page: Page, title: string): Promise<void> {
  console.log("\n✏️ STEP 4: 제목 입력");
  
  // 에디터 페이지 재확인
  const currentUrl = page.url();
  if (!currentUrl.includes('postwrite') && !currentUrl.includes('blog.naver.com')) {
    throw new Error(`에디터 페이지가 아님: ${currentUrl}`);
  }
  
  // 제목 영역 클릭 (여러 셀렉터 시도)
  const titleSelectors = [
    '.se-documentTitle .se-text-paragraph',
    '.se-documentTitle',
    '[class*="title"] [contenteditable="true"]',
    '.se-ff-nanumgothic.se-fs32',
  ];
  
  let titleArea = null;
  for (const selector of titleSelectors) {
    titleArea = await page.$(selector);
    if (titleArea && await titleArea.isVisible()) {
      await titleArea.click();
      console.log(`   제목 영역 클릭: ${selector}`);
      await page.waitForTimeout(300);
      break;
    }
  }
  
  if (!titleArea) {
    console.log("   ⚠️ 제목 영역 못 찾음, 좌표 클릭 시도...");
    // 스크롤 맨 위로
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(500);
    await page.mouse.click(640, 130);
    await page.waitForTimeout(300);
  }
  
  await page.keyboard.type(title, { delay: 30 });
  console.log(`   ✅ 제목 입력: "${title}"`);
}

// ============================================
// STEP 5: 이미지 1장 업로드 (반복 호출용)
// ============================================
async function uploadOneImage(page: Page, imagePath: string): Promise<boolean> {
  try {
    // 이미지 버튼 셀렉터 (여러 가지 시도)
    const imageBtnSelectors = [
      'button[data-name="image"]',
      'button.se-image-toolbar-button',
      'button[class*="image"]',
      '.se-toolbar button:has(svg[class*="image"])',
    ];
    
    let imageBtn = null;
    for (const selector of imageBtnSelectors) {
      imageBtn = await page.$(selector);
      if (imageBtn && await imageBtn.isVisible()) break;
      imageBtn = null;
    }
    
    if (!imageBtn) {
      console.log(`   ⚠️ 이미지 버튼 못 찾음`);
      return false;
    }
    
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
      imageBtn.click()
    ]);
    
    if (fileChooser) {
      await fileChooser.setFiles(imagePath);
      await page.waitForTimeout(2500); // 업로드 완료 대기
      return true;
    }
  } catch (e) {
    console.log(`   ⚠️ 업로드 실패: ${e}`);
  }
  return false;
}

// 텍스트 섹션 입력 (줄바꿈 포함)
async function inputTextSection(page: Page, text: string): Promise<void> {
  // \n을 실제 줄바꿈으로 처리
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      // 빈 줄이면 Enter만
      await page.keyboard.press('Enter');
    } else {
      // 텍스트가 있으면 입력 후 Enter
      await page.keyboard.type(line, { delay: 3 });
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(50);
  }
  
  // 섹션 끝에 여백 추가
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

// ============================================
// STEP 5+6: 이미지와 본문 번갈아 입력
// ============================================
async function step5and6_uploadAndWrite(page: Page, imagePaths: string[], sections: string[], hashtags: string[]): Promise<void> {
  console.log("\n📝 STEP 5+6: 이미지 + 본문 번갈아 입력");
  
  // 본문 영역으로 이동
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  
  const maxLoop = Math.max(imagePaths.length, sections.length);
  let uploadedCount = 0;
  
  for (let i = 0; i < maxLoop; i++) {
    // 이미지 업로드 (있으면)
    if (i < imagePaths.length) {
      console.log(`   [${i + 1}] 🖼️ 이미지 업로드...`);
      const success = await uploadOneImage(page, imagePaths[i]);
      if (success) uploadedCount++;
    }
    
    // 텍스트 섹션 입력 (있으면)
    if (i < sections.length) {
      console.log(`   [${i + 1}] ✏️ 텍스트 입력 (${sections[i].length}자)`);
      await inputTextSection(page, sections[i]);
      await page.waitForTimeout(300);
    }
  }
  
  // 해시태그 (맨 마지막) - 스페이스 제거하여 태그 깨짐 방지
  await page.keyboard.press('Enter');
  const hashtagText = hashtags.map((t: string) => `#${t.replace(/\s+/g, '')}`).join(' ');
  await page.keyboard.type(hashtagText, { delay: 10 });
  
  console.log(`\n   ✅ 총 이미지 ${uploadedCount}개 업로드`);
  console.log(`   ✅ 총 섹션 ${sections.length}개 입력`);
  console.log(`   ✅ 해시태그 ${hashtags.length}개`);
}

// ============================================
// STEP 7: 발행 (도움말 닫기 → 발행 버튼 → 설정 → 최종 발행)
// ============================================
async function step7_publish(page: Page): Promise<boolean> {
  console.log("\n🚀 STEP 7: 발행");
  
  // 1. 도움말/팝업/사이드바 닫기
  console.log("   도움말/팝업 닫기...");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  
  // 닫기 버튼들 클릭 시도
  const closeSelectors = [
    '.help_layer button[class*="close"]',
    '.tooltip button[class*="close"]',
    '.guide_layer button[class*="close"]',
    '[class*="close_btn"]',
    '[class*="closeBtn"]',
    'button[aria-label="닫기"]',
    '.se-help-panel-close-button',
  ];
  
  for (const selector of closeSelectors) {
    const closeBtn = await page.$(selector);
    if (closeBtn) {
      await closeBtn.click().catch(() => {});
      console.log(`   닫기 버튼 클릭: ${selector}`);
      await page.waitForTimeout(300);
    }
  }
  
  // 페이지 상단으로
  await page.evaluate(`window.scrollTo(0, 0)`);
  await page.waitForTimeout(500);
  
  // 2. 첫 번째 발행 버튼 클릭 (상단 헤더)
  console.log("   1차 발행 버튼 클릭...");
  
  // 우측 상단 발행 버튼 (초록색)
  const headerPublishBtn = await page.$('button[class*="publish_btn"], header button[class*="publish"]');
  if (headerPublishBtn) {
    await headerPublishBtn.click({ force: true }).catch(() => {});
    console.log("   ✅ 헤더 발행 버튼 클릭");
  } else {
    // 좌표로 클릭 (우측 상단)
    await page.mouse.click(1210, 22);
    console.log("   ✅ 좌표로 발행 버튼 클릭");
  }
  
  await page.waitForTimeout(2000);
  
  // 3. 발행 설정 화면에서 최종 발행 버튼 클릭
  console.log("   2차 최종 발행 버튼...");
  await page.waitForTimeout(1500);
  
  // 발행 확인 버튼 셀렉터들 (우측 하단 초록색 "발행" 버튼)
  const finalPublishSelectors = [
    'button.confirm_btn__WEaBq',              // 최신 네이버 발행 확인 버튼
    'button[class*="confirm_btn"]',
    'button.btn_publish__FvD4K',
    'button[class*="btn_publish"]',
    '.publish_layer button[class*="confirm"]',
    '.btn_area button:has-text("발행")',
  ];
  
  for (const selector of finalPublishSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn && await btn.isVisible()) {
        console.log(`   ✅ 최종 발행 버튼 발견: ${selector}`);
        await btn.click({ force: true });
        console.log("   🎉 최종 발행 클릭!");
        await page.waitForTimeout(5000);
        return true;
      }
    } catch {}
  }
  
  // 4. "발행" 텍스트가 있는 버튼 찾기
  console.log("   텍스트로 발행 버튼 찾기...");
  const publishButtons = await page.$$('button');
  for (const btn of publishButtons) {
    const text = await btn.textContent();
    if (text && text.includes('발행') && !text.includes('예약')) {
      const isVisible = await btn.isVisible();
      if (isVisible) {
        console.log(`   ✅ "발행" 버튼 발견`);
        await btn.click({ force: true });
        console.log("   🎉 최종 발행 클릭!");
        await page.waitForTimeout(5000);
        return true;
      }
    }
  }
  
  // 5. 좌표로 최종 발행 버튼 클릭 (이미지 참고: 우측 하단 "✓ 발행")
  console.log("   좌표로 최종 발행 버튼 클릭...");
  // 발행 설정 화면 기준 우측 하단 발행 버튼 (약 480, 460 위치)
  await page.mouse.click(480, 455);
  await page.waitForTimeout(2000);
  
  // 한번 더 시도 (조금 다른 위치)
  await page.mouse.click(470, 450);
  await page.waitForTimeout(3000);
  
  return true;
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  const linkId = process.argv[2];
  
  if (!linkId) {
    console.error("사용법: npx ts-node scripts/simple-agent.ts <linkId>");
    process.exit(1);
  }
  
  console.log("=".repeat(50));
  console.log("🤖 심플 에이전트 시작");
  console.log("=".repeat(50));
  
  // 세션 확인
  if (!fs.existsSync(SESSION_FILE)) {
    console.error("❌ 네이버 로그인 세션이 없습니다. npm run login 실행하세요.");
    process.exit(1);
  }
  
  // DB에서 링크 조회
  const link = await prisma.brandLink.findUnique({ where: { id: linkId } });
  if (!link) {
    console.error("❌ 링크를 찾을 수 없습니다.");
    process.exit(1);
  }
  
  console.log(`\n📎 URL: ${link.url}`);
  
  // 브라우저 시작 (봇 감지 우회 설정)
  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,  // 더 자연스러운 속도
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  // 봇 감지 우회 스크립트 (문자열로 전달)
  await page.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  `);
  
  try {
    // STEP 1: 상품 정보 + 이미지 수집
    const product = await step1_getProductInfo(page, link.url);
    
    console.log("\n" + "-".repeat(40));
    console.log(`📦 상품: ${product.name}`);
    console.log(`💰 가격: ${product.price}`);
    console.log(`🖼️ 이미지: ${product.imagePaths.length}개`);
    console.log("-".repeat(40));
    
    // STEP 2: SEO 최적화 글 생성
    const post = await step2_generatePost(product, link.url);
    
    // STEP 3: 에디터 열기
    await step3_openEditor(page);
    
    // STEP 4: 제목 입력
    await step4_inputTitle(page, post.title);
    
    // STEP 5+6: 이미지와 본문 번갈아 입력
    await step5and6_uploadAndWrite(page, product.imagePaths, post.sections, post.hashtags);
    
    // STEP 7: 발행
    const published = await step7_publish(page);
    
    // 결과 확인
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    
    if (currentUrl.includes('PostView') || currentUrl.includes('logNo') || published) {
      console.log("\n" + "=".repeat(50));
      console.log("🎉 발행 완료!");
      console.log(`📄 URL: ${currentUrl}`);
      console.log(`📦 상품: ${product.name}`);
      console.log(`🖼️ 이미지: ${product.imagePaths.length}개`);
      console.log(`📝 섹션: ${post.sections.length}개`);
      console.log("=".repeat(50));
      
      await prisma.brandLink.update({
        where: { id: linkId },
        data: {
          status: "PUBLISHED",
          productName: product.name,
          publishedAt: new Date(),
          postUrl: currentUrl,
        }
      });
    } else {
      console.log("\n⚠️ 발행 결과를 확인하세요. 브라우저에서 수동으로 발행해주세요.");
    }
    
    // 임시 파일 정리
    for (const imgPath of product.imagePaths) {
      try { fs.unlinkSync(imgPath); } catch {}
    }
    
    // 브라우저 유지 (확인용)
    console.log("\n브라우저를 닫으면 종료됩니다.");
    await new Promise<void>(resolve => browser.on("disconnected", () => resolve()));
    
  } catch (error: any) {
    console.error("\n❌ 오류:", error.message);
    
    await prisma.brandLink.update({
      where: { id: linkId },
      data: { status: "FAILED", errorMessage: error.message }
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();


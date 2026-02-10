/**
 * placeholder → 진짜 naver.me 링크로 변환
 * 
 * placeholder URL에서 상품 ID 추출 → 브랜드커넥트 상세 페이지 접속 → 링크 복사
 * 
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/fix-placeholders.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SPACE_ID = '916586454843392';
const SESSION_PATH = path.join(__dirname, '..', 'playwright', 'storage', 'naver-session.json');

async function getNaverMeLink(page: Page, productId: string): Promise<string | null> {
  const productUrl = `https://brandconnect.naver.com/${SPACE_ID}/affiliate/products/${productId}`;
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // 로그인 체크
    if (page.url().includes('nidlogin')) {
      console.log('   ❌ 세션 만료');
      return null;
    }
    
    // "링크 복사" 버튼 찾기
    const copyBtn = page.locator('button:has-text("링크 복사")');
    const exists = await copyBtn.count();
    
    if (exists === 0) {
      // "링크 발급" 버튼 있는지 확인
      const generateBtn = page.locator('button:has-text("링크 발급")');
      if (await generateBtn.count() > 0) {
        console.log('   📝 링크 발급 필요 (미발급 상품)');
        // 발급 버튼 클릭
        await generateBtn.click();
        await page.waitForTimeout(500);
      } else {
        console.log('   ⚠️ 버튼 없음');
        return null;
      }
    }
    
    // 클립보드 인터셉트
    await page.evaluate(() => {
      (window as any).__copiedLink = null;
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text: string) => {
        (window as any).__copiedLink = text;
        return orig(text);
      };
    });
    
    // 복사 버튼 클릭
    const btn = page.locator('button:has-text("링크 복사")').first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(300);
      
      const link = await page.evaluate(() => (window as any).__copiedLink);
      if (link && link.includes('naver.me')) {
        return link;
      }
    }
    
    return null;
  } catch (error: any) {
    console.log(`   ❌ 에러: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔧 placeholder 수정 시작\n');

  if (!fs.existsSync(SESSION_PATH)) {
    console.error('❌ 세션 없음. npm run login 실행');
    process.exit(1);
  }

  // placeholder 목록 가져오기
  const placeholders = await prisma.brandLink.findMany({
    where: { url: { startsWith: 'placeholder:' } }
  });

  console.log(`📦 placeholder ${placeholders.length}개 발견\n`);

  if (placeholders.length === 0) {
    console.log('✅ 수정할 placeholder 없음!');
    await prisma.$disconnect();
    return;
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: false,
      slowMo: 30
    });

    const context = await browser.newContext({
      storageState: SESSION_PATH
    });

    const page = await context.newPage();

    let fixed = 0;
    let failed = 0;
    let notIssued = 0;

    for (let i = 0; i < placeholders.length; i++) {
      const item = placeholders[i];
      const productId = item.url.replace('placeholder:', '');
      
      console.log(`[${i + 1}/${placeholders.length}] ${item.productName?.substring(0, 40) || productId}...`);
      
      const naverMeLink = await getNaverMeLink(page, productId);
      
      if (naverMeLink) {
        await prisma.brandLink.update({
          where: { id: item.id },
          data: { url: naverMeLink }
        });
        console.log(`   ✅ ${naverMeLink}`);
        fixed++;
      } else {
        console.log(`   ⏭️ 스킵`);
        failed++;
      }
      
      // 속도 조절
      await page.waitForTimeout(200);
    }

    await browser.close();

    // 결과
    console.log('\n📊 결과:');
    console.log(`   ✅ 수정 완료: ${fixed}개`);
    console.log(`   ❌ 실패/스킵: ${failed}개`);

    // 현재 상태
    const remaining = await prisma.brandLink.count({
      where: { url: { startsWith: 'placeholder:' } }
    });
    
    const realReady = await prisma.brandLink.count({
      where: { 
        status: 'READY',
        url: { startsWith: 'https://naver.me' }
      }
    });

    console.log('\n📈 현재 DB 상태:');
    console.log(`   - 진짜 naver.me (READY): ${realReady}개 ✅`);
    console.log(`   - 남은 placeholder: ${remaining}개`);

    console.log('\n✅ 완료!');

  } catch (error) {
    console.error('❌ 오류:', error);
    if (browser) await browser.close();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

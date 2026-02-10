/**
 * 브랜드커넥트에서 발급된 naver.me 링크를 수집하여 DB에 저장/업데이트
 * 
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/collect-links.ts
 * 
 * 기능:
 * 1. 브랜드커넥트에서 발급된 모든 링크 수집
 * 2. 기존 placeholder URL → 진짜 naver.me로 업데이트
 * 3. 새 상품은 DB에 추가
 */

import { chromium, Browser, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// .env에서 세션 복구
function restoreSessionFromEnv(sessionPath: string): boolean {
  const backup = process.env.NAVER_SESSION_BACKUP;
  if (!backup) {
    console.log('   ℹ️ .env에 백업 세션 없음');
    return false;
  }
  
  try {
    const sessionData = Buffer.from(backup, 'base64').toString('utf-8');
    // 유효한 JSON인지 확인
    JSON.parse(sessionData);
    
    // 디렉토리 생성
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(sessionPath, sessionData);
    console.log('   ✅ .env에서 세션 복구 완료');
    return true;
  } catch (error) {
    console.log('   ❌ 세션 복구 실패:', error);
    return false;
  }
}

interface CollectedProduct {
  productName: string;
  storeName: string;
  price: string;
  commission: string;
  naverMeLink: string;
}

const SPACE_ID = '916586454843392';
const BRAND_CONNECT_URL = `https://brandconnect.naver.com/${SPACE_ID}/affiliate/products-link`;
const SESSION_PATH = path.join(__dirname, '..', 'playwright', 'storage', 'naver-session.json');

async function collectLinksFromPage(page: Page): Promise<CollectedProduct[]> {
  // 클립보드 writeText 가로채기
  await page.evaluate(() => {
    (window as any).__collectedLinks = [];
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text: string) => {
      (window as any).__lastCopied = text;
      return originalWriteText(text);
    };
  });

  await page.waitForTimeout(500);

  // 현재 페이지의 모든 상품 수집
  const products = await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const rows = document.querySelectorAll('tbody tr');
    const results: any[] = [];

    for (const row of rows) {
      const nameEl = row.querySelector('td:first-child a');
      const storeEl = row.querySelector('td:nth-child(2)');
      const priceEl = row.querySelector('td:nth-child(3)');
      const commissionEl = row.querySelector('td:nth-child(4)');
      const copyBtn = row.querySelector('button');

      const productName = nameEl?.textContent?.trim() || '';
      const storeName = storeEl?.textContent?.trim() || '';
      const price = priceEl?.textContent?.trim() || '';
      const commission = commissionEl?.textContent?.trim() || '';

      if (copyBtn && copyBtn.textContent?.includes('복사')) {
        (window as any).__lastCopied = null;
        (copyBtn as HTMLButtonElement).click();
        await sleep(300);

        if ((window as any).__lastCopied) {
          results.push({
            productName,
            storeName,
            price,
            commission,
            naverMeLink: (window as any).__lastCopied
          });
        }
      }
    }

    return results;
  });

  return products;
}

async function getTotalPages(page: Page): Promise<number> {
  const pageButtons = await page.locator('nav[aria-label*="페이지"] button').all();
  let maxPage = 1;
  
  for (const btn of pageButtons) {
    const text = await btn.textContent();
    if (text) {
      const num = parseInt(text.trim());
      if (!isNaN(num) && num > maxPage) {
        maxPage = num;
      }
    }
  }
  
  return maxPage;
}

// 상품명 정규화 (비교용)
function normalizeProductName(name: string): string {
  return name
    .replace(/\[.*?\]/g, '') // [태그] 제거
    .replace(/,\s*\d+개$/, '') // 수량 제거 (", 1개", ", 2개" 등)
    .replace(/\s+/g, ' ')    // 다중 공백 → 단일 공백
    .trim()
    .toLowerCase()
    .substring(0, 50);       // 앞 50자만
}

// 상품명에서 수량 추출 (기본값 1)
function getQuantity(name: string): number {
  const match = name.match(/,\s*(\d+)개$/);
  return match ? parseInt(match[1]) : 1;
}

async function main() {
  console.log('🚀 브랜드커넥트 링크 수집 시작\n');

  // 세션 파일 없으면 .env에서 복구 시도
  if (!fs.existsSync(SESSION_PATH)) {
    console.log('⚠️ 네이버 세션 파일이 없습니다. .env에서 복구 시도...');
    if (!restoreSessionFromEnv(SESSION_PATH)) {
      console.error('❌ 세션 복구 실패. npm run login 실행하세요.');
      process.exit(1);
    }
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: false, // 디버깅용
      slowMo: 50
    });

    const context = await browser.newContext({
      storageState: SESSION_PATH
    });

    let page = await context.newPage();

    console.log('📄 브랜드커넥트 접속 중...');
    await page.goto(BRAND_CONNECT_URL, { waitUntil: 'networkidle' });

    if (page.url().includes('nidlogin')) {
      console.log('⚠️ 세션 만료 감지. .env에서 복구 시도...');
      await browser.close();
      
      if (!restoreSessionFromEnv(SESSION_PATH)) {
        console.error('❌ 세션 복구 실패. npm run login 실행하세요.');
        process.exit(1);
      }
      
      // 복구된 세션으로 재시도
      console.log('🔄 복구된 세션으로 재시도...');
      browser = await chromium.launch({
        headless: false,
        slowMo: 50
      });
      
      const newContext = await browser.newContext({
        storageState: SESSION_PATH
      });
      
      page = await newContext.newPage();
      await page.goto(BRAND_CONNECT_URL, { waitUntil: 'networkidle' });
      
      if (page.url().includes('nidlogin')) {
        console.error('❌ 복구된 세션도 만료됨. npm run login 실행하세요.');
        await browser.close();
        process.exit(1);
      }
    }

    await page.waitForSelector('tbody tr', { timeout: 10000 });

    const totalPages = await getTotalPages(page);
    console.log(`📊 총 ${totalPages} 페이지\n`);

    const allProducts: CollectedProduct[] = [];

    // 모든 페이지 수집
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`📖 페이지 ${pageNum}/${totalPages} 수집 중...`);

      if (pageNum > 1) {
        const pageBtn = page.locator(`nav[aria-label*="페이지"] button:has-text("${pageNum}")`);
        await pageBtn.click();
        await page.waitForTimeout(1000);
        await page.waitForSelector('tbody tr');
      }

      const products = await collectLinksFromPage(page);
      allProducts.push(...products);
      console.log(`   ✅ ${products.length}개 (총 ${allProducts.length}개)`);
    }

    await browser.close();
    console.log(`\n📦 총 ${allProducts.length}개 수집 완료\n`);

    // === DB 저장 및 placeholder 업데이트 ===
    
    // 1. 기존 placeholder 상품들 가져오기
    const placeholders = await prisma.brandLink.findMany({
      where: { url: { startsWith: 'placeholder:' } }
    });
    console.log(`🔄 placeholder ${placeholders.length}개 발견\n`);

    // 상품명 → placeholder 매핑
    const placeholderMap = new Map<string, typeof placeholders[0]>();
    for (const p of placeholders) {
      if (p.productName) {
        placeholderMap.set(normalizeProductName(p.productName), p);
      }
    }

    let added = 0;
    let updated = 0;
    let placeholderFixed = 0;
    let skipped = 0;
    let quantitySkipped = 0;

    // 이미 처리한 정규화된 상품명 추적 (수량 중복 방지)
    const processedBaseNames = new Set<string>();

    // 기존 DB에 있는 상품들의 정규화된 이름 수집
    const existingLinks = await prisma.brandLink.findMany();
    for (const link of existingLinks) {
      if (link.productName) {
        processedBaseNames.add(normalizeProductName(link.productName));
      }
    }

    for (const product of allProducts) {
      const normalizedName = normalizeProductName(product.productName);
      const quantity = getQuantity(product.productName);
      
      // 0. 수량 중복 체크 - 1개짜리만 추가, 2개/3개는 스킵
      if (quantity > 1 && processedBaseNames.has(normalizedName)) {
        quantitySkipped++;
        continue;
      }

      // 1. 이미 이 URL이 있는지 확인
      const existingByUrl = await prisma.brandLink.findFirst({
        where: { url: product.naverMeLink }
      });

      if (existingByUrl) {
        if (existingByUrl.status === 'PUBLISHED') {
          skipped++;
        } else {
          // 정보 업데이트
          await prisma.brandLink.update({
            where: { id: existingByUrl.id },
            data: {
              productName: product.productName,
              storeName: product.storeName,
              productPrice: product.price,
              memo: JSON.stringify({ commission: product.commission })
            }
          });
          updated++;
        }
        processedBaseNames.add(normalizedName);
        continue;
      }

      // 2. placeholder와 매칭되는지 확인
      const matchedPlaceholder = placeholderMap.get(normalizedName);
      
      if (matchedPlaceholder) {
        // placeholder → 진짜 URL로 업데이트
        await prisma.brandLink.update({
          where: { id: matchedPlaceholder.id },
          data: {
            url: product.naverMeLink,
            productName: product.productName,
            storeName: product.storeName,
            productPrice: product.price,
            memo: JSON.stringify({ commission: product.commission })
          }
        });
        placeholderMap.delete(normalizedName); // 매칭된 건 제거
        placeholderFixed++;
        processedBaseNames.add(normalizedName);
        console.log(`   🔗 placeholder 수정: ${product.productName.substring(0, 40)}...`);
        continue;
      }

      // 3. 새로 추가
      await prisma.brandLink.create({
        data: {
          url: product.naverMeLink,
          productName: product.productName,
          storeName: product.storeName,
          productPrice: product.price,
          status: 'READY',
          memo: JSON.stringify({ commission: product.commission })
        }
      });
      added++;
      processedBaseNames.add(normalizedName);
    }

    // 결과 출력
    console.log('\n📊 결과:');
    console.log(`   ➕ 새로 추가: ${added}개`);
    console.log(`   🔄 정보 업데이트: ${updated}개`);
    console.log(`   🔗 placeholder 수정: ${placeholderFixed}개`);
    console.log(`   ⏭️  스킵 (발행완료): ${skipped}개`);
    console.log(`   🔢 스킵 (수량 중복): ${quantitySkipped}개`);

    // 남은 placeholder 개수
    const remainingPlaceholders = await prisma.brandLink.count({
      where: { url: { startsWith: 'placeholder:' } }
    });
    
    if (remainingPlaceholders > 0) {
      console.log(`\n⚠️  아직 placeholder ${remainingPlaceholders}개 남음 (브랜드커넥트에서 미발급)`);
    }

    // 현재 DB 상태
    const realLinks = await prisma.brandLink.count({
      where: { 
        status: 'READY',
        url: { startsWith: 'https://naver.me' }
      }
    });

    const stats = await prisma.brandLink.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    console.log('\n📈 현재 DB 상태:');
    for (const stat of stats) {
      console.log(`   - ${stat.status}: ${stat._count.status}개`);
    }
    console.log(`   - 진짜 naver.me (READY): ${realLinks}개 ✅`);

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

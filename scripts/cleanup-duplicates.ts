/**
 * 중복 정리 스크립트
 * 1. 같은 URL에 PUBLISHED + READY 있으면 READY 삭제
 * 2. 수량만 다른 중복은 가장 낮은 수량(1개)만 남김
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 중복 정리 시작\n');

  // 1. 같은 URL에 PUBLISHED + READY 중복 제거
  const allLinks = await prisma.brandLink.findMany();
  const urlGroups = new Map<string, typeof allLinks>();
  
  for (const link of allLinks) {
    const existing = urlGroups.get(link.url) || [];
    existing.push(link);
    urlGroups.set(link.url, existing);
  }

  let duplicateUrlRemoved = 0;
  for (const [url, links] of urlGroups) {
    if (links.length > 1) {
      const hasPublished = links.some(l => l.status === 'PUBLISHED');
      if (hasPublished) {
        // PUBLISHED 있으면 READY들 삭제
        for (const link of links) {
          if (link.status === 'READY') {
            console.log(`🗑️  삭제 (URL 중복): ${link.productName?.substring(0, 40)}`);
            await prisma.brandLink.delete({ where: { id: link.id } });
            duplicateUrlRemoved++;
          }
        }
      } else {
        // PUBLISHED 없으면 첫 번째만 남기고 삭제
        for (let i = 1; i < links.length; i++) {
          console.log(`🗑️  삭제 (URL 중복): ${links[i].productName?.substring(0, 40)}`);
          await prisma.brandLink.delete({ where: { id: links[i].id } });
          duplicateUrlRemoved++;
        }
      }
    }
  }

  console.log(`\n✅ URL 중복 ${duplicateUrlRemoved}개 제거\n`);

  // 2. 수량만 다른 중복 제거 (1개만 남기고 2개, 3개 삭제)
  // 패턴: "상품명, 1개" / "상품명, 2개" / "상품명, 3개"
  const remaining = await prisma.brandLink.findMany({
    where: { status: 'READY' }
  });

  // 상품명에서 수량 제거한 베이스 이름으로 그룹화
  function getBaseName(name: string | null): string {
    if (!name) return '';
    // ", 1개", ", 2개", ", 3개" 등 제거
    return name.replace(/,\s*\d+개$/, '').trim();
  }

  function getQuantity(name: string | null): number {
    if (!name) return 1;
    const match = name.match(/,\s*(\d+)개$/);
    return match ? parseInt(match[1]) : 1;
  }

  const baseGroups = new Map<string, typeof remaining>();
  for (const link of remaining) {
    const baseName = getBaseName(link.productName);
    if (!baseName) continue;
    const existing = baseGroups.get(baseName) || [];
    existing.push(link);
    baseGroups.set(baseName, existing);
  }

  let quantityDupsRemoved = 0;
  for (const [baseName, links] of baseGroups) {
    if (links.length > 1) {
      // 수량별로 정렬 (1개가 앞으로)
      links.sort((a, b) => getQuantity(a.productName) - getQuantity(b.productName));
      
      // 1개(또는 가장 적은 수량)만 남기고 삭제
      console.log(`\n📦 "${baseName}" 그룹:`);
      console.log(`   ✅ 유지: ${links[0].productName}`);
      
      for (let i = 1; i < links.length; i++) {
        console.log(`   🗑️  삭제: ${links[i].productName}`);
        await prisma.brandLink.delete({ where: { id: links[i].id } });
        quantityDupsRemoved++;
      }
    }
  }

  console.log(`\n✅ 수량 중복 ${quantityDupsRemoved}개 제거`);

  // 최종 상태
  const finalCount = await prisma.brandLink.count({ where: { status: 'READY' } });
  const publishedCount = await prisma.brandLink.count({ where: { status: 'PUBLISHED' } });
  
  console.log('\n📊 최종 상태:');
  console.log(`   - READY: ${finalCount}개`);
  console.log(`   - PUBLISHED: ${publishedCount}개`);
  console.log(`   - 총 삭제: ${duplicateUrlRemoved + quantityDupsRemoved}개`);

  await prisma.$disconnect();
}

main();

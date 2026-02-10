const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const published = await p.brandLink.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 20
  });
  console.log('최근 발행된 상품 (' + published.length + '개):');
  published.forEach(prod => {
    console.log(`- [${prod.id.slice(0,8)}] ${prod.productName} | ${prod.publishedAt}`);
  });
  
  // 중복 체크 - 같은 이름으로 여러 번 발행된 거
  const counts = {};
  published.forEach(p => {
    if (p.productName) {
      counts[p.productName] = (counts[p.productName] || 0) + 1;
    }
  });
  const duplicates = Object.entries(counts).filter(([k,v]) => v > 1);
  if (duplicates.length > 0) {
    console.log('\n⚠️ 중복 발행된 상품:');
    duplicates.forEach(([name, count]) => {
      console.log(`  - ${name}: ${count}회`);
    });
  } else {
    console.log('\n✅ DB 내 중복 없음');
  }
}

main().finally(() => p.$disconnect());

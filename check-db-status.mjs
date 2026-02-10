import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.brandLink.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('\n=== BrandLink DB 현황 ===\n');
  console.log(`총 ${links.length}개 레코드\n`);
  
  const byStatus = {};
  for (const link of links) {
    byStatus[link.status] = (byStatus[link.status] || 0) + 1;
  }
  console.log('상태별 현황:', byStatus);
  
  console.log('\n=== READY 상태 (발행 대기) ===');
  const ready = links.filter(l => l.status === 'READY');
  if (ready.length === 0) {
    console.log('발행 대기중인 링크 없음');
  } else {
    for (const l of ready) {
      console.log(`- ${l.productName || '(이름없음)'}: ${l.url}`);
    }
  }
  
  console.log('\n=== 전체 목록 ===');
  for (const l of links) {
    console.log(`[${l.status.padEnd(10)}] ${(l.productName || l.url).substring(0, 50)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

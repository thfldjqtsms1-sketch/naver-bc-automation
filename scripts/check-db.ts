import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.brandLink.findMany({
    orderBy: { productName: 'asc' }
  });
  
  console.log('=== 모든 링크 ===');
  for (const link of links) {
    console.log(`[${link.status}] ${link.productName}`);
    console.log(`   URL: ${link.url}`);
    console.log('');
  }
  
  console.log(`총 ${links.length}개`);
  
  await prisma.$disconnect();
}

main();

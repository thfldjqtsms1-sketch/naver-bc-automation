import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.brandLink.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      productName: true,
      status: true
    }
  });
  
  console.log('=== Brand Links Status ===');
  for (const l of links) {
    console.log(`${l.status.padEnd(12)} | ${l.id.slice(0,8)}... | ${l.productName || '(no name)'}`);
  }
  
  await prisma.$disconnect();
}

main();

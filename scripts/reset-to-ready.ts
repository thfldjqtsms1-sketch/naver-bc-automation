import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // FAILED 상태인 가장 최근 항목을 READY로 복구
  const result = await prisma.brandLink.updateMany({
    where: { 
      id: 'ed6d2dbd-3ce8-4e32-ba8b-9b91888a65c3',
      status: 'FAILED'
    },
    data: { status: 'READY' }
  });
  
  console.log(`Updated ${result.count} record(s) to READY`);
  await prisma.$disconnect();
}

main();

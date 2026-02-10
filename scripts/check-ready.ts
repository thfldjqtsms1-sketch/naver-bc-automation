import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.brandLink.findMany({ 
    where: { status: 'READY' }
  });
  console.log(JSON.stringify(links, null, 2));
  await prisma.$disconnect();
}

main();

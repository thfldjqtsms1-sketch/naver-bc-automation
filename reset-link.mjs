import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

await prisma.brandLink.update({
  where: { id: 'ed6d2dbd-3ce8-4e32-ba8b-9b91888a65c3' },
  data: { status: 'READY', errorMessage: null }
});

console.log('✅ Reset to READY');
await prisma.$disconnect();

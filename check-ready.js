const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const links = await p.brandLink.findMany({
    where: { status: 'READY' },
    select: { id: true, productName: true, url: true }
  });
  console.log(JSON.stringify(links, null, 2));
  await p.$disconnect();
}

main();

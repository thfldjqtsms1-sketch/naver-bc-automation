import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const links = await prisma.brandLink.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
});

console.log(JSON.stringify(links, null, 2));
await prisma.$disconnect();

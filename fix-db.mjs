import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 잇퓨 순율 크림 - 올바른 발급 링크로 수정
await prisma.brandLink.update({
  where: { id: "567d7761-dac2-48fc-8f81-cf924072b56e" },
  data: { url: "https://naver.me/FNtrerhz" },
});

console.log("✅ 잇퓨 순율 크림 URL 수정 완료!");
console.log("   변경: smartstore.naver.com → naver.me/FNtrerhz");

await prisma.$disconnect();

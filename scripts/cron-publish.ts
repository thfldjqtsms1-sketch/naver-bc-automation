/**
 * 발행 크론잡
 * 
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/cron-publish.ts
 * 
 * 1. 진짜 naver.me 링크가 있는 READY 상품만 발행
 * 2. simple-agent.ts 호출해서 블로그 발행
 */

import "dotenv/config";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();

async function getNextReadyLink() {
  // 진짜 naver.me 링크만 가져오기 (placeholder 제외)
  return await prisma.brandLink.findFirst({
    where: { 
      status: "READY",
      url: { startsWith: "https://naver.me" }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function publishOne(): Promise<boolean> {
  const link = await getNextReadyLink();

  if (!link) {
    console.log("📭 발행할 상품이 없습니다. (진짜 naver.me 링크만 발행)");
    return false;
  }

  console.log(`\n🚀 발행 시작: ${link.productName || link.url}`);
  console.log(`   링크: ${link.url}`);

  try {
    execSync(
      `npx ts-node --project tsconfig.scripts.json scripts/simple-agent.ts "${link.id}"`,
      {
        cwd: path.join(__dirname, '..'),
        encoding: "utf-8",
        timeout: 10 * 60 * 1000, // 10분
        stdio: "inherit"
      }
    );
    return true;
  } catch (error) {
    console.error("❌ 발행 실패:", error);
    
    // 실패 처리
    await prisma.brandLink.update({
      where: { id: link.id },
      data: { 
        status: "FAILED",
        errorMessage: String(error)
      }
    });
    return false;
  }
}

async function showStats() {
  const realReady = await prisma.brandLink.count({
    where: { 
      status: "READY",
      url: { startsWith: "https://naver.me" }
    }
  });

  const placeholderReady = await prisma.brandLink.count({
    where: { 
      status: "READY",
      url: { startsWith: "placeholder:" }
    }
  });

  const published = await prisma.brandLink.count({
    where: { status: "PUBLISHED" }
  });

  const failed = await prisma.brandLink.count({
    where: { status: "FAILED" }
  });

  console.log("\n📈 현재 상태:");
  console.log(`   ✅ 발행 가능 (naver.me): ${realReady}개`);
  console.log(`   ⚠️  placeholder (발급 필요): ${placeholderReady}개`);
  console.log(`   📤 발행 완료: ${published}개`);
  console.log(`   ❌ 실패: ${failed}개`);
}

async function main() {
  console.log("=".repeat(50));
  console.log("🕐 발행 크론잡 시작");
  console.log("=".repeat(50));

  await showStats();

  // 1개 발행
  const result = await publishOne();

  if (result) {
    console.log("\n✅ 발행 성공!");
  }

  await showStats();

  console.log("\n" + "=".repeat(50));
  console.log("✅ 크론잡 완료");
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch(console.error);

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: 전체 링크 조회
export async function GET() {
  try {
    const links = await prisma.brandLink.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: links });
  } catch (error: any) {
    console.error("링크 조회 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: 링크 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, memo } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL이 필요합니다." },
        { status: 400 }
      );
    }

    // 중복 체크
    const existing = await prisma.brandLink.findFirst({
      where: { url },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "이미 등록된 URL입니다." },
        { status: 400 }
      );
    }

    const link = await prisma.brandLink.create({
      data: {
        url,
        memo: memo || null,
        status: "READY",
      },
    });

    return NextResponse.json({ success: true, data: link });
  } catch (error: any) {
    console.error("링크 추가 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


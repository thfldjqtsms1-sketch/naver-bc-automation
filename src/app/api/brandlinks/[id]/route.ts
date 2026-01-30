import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: 단일 링크 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const link = await prisma.brandLink.findUnique({
      where: { id },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "링크를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: link });
  } catch (error: any) {
    console.error("링크 조회 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: 링크 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await prisma.brandLink.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("링크 삭제 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH: 링크 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const link = await prisma.brandLink.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ success: true, data: link });
  } catch (error: any) {
    console.error("링크 수정 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


/**
 * 네이버 로그인 세션 관리 API
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const SESSION_FILE = path.join(process.cwd(), "playwright", "storage", "naver-session.json");

/**
 * GET /api/session
 * 현재 세션 상태 조회 (파일 존재 여부로 간단히 확인)
 */
export async function GET() {
  try {
    // 세션 파일 존재 여부 확인
    const hasSession = fs.existsSync(SESSION_FILE);
    
    let lastChecked: Date | null = null;
    
    if (hasSession) {
      // 파일 수정 시간으로 마지막 로그인 시간 추정
      const stats = fs.statSync(SESSION_FILE);
      lastChecked = stats.mtime;
    }

    return NextResponse.json({
      success: true,
      data: {
        hasSession,
        isValid: hasSession, // 파일이 있으면 유효하다고 가정
        lastChecked: lastChecked?.toISOString(),
        sessionPath: SESSION_FILE,
      },
    });
  } catch (error) {
    console.error("세션 조회 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "세션 조회 실패",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/session
 * 세션 갱신 요청 (수동 로그인 안내)
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    message: "로그인이 필요합니다. 터미널에서 `npm run login` 명령을 실행해주세요.",
    instructions: [
      "1. 터미널에서 `npm run login` 실행",
      "2. 브라우저가 열리면 네이버에 로그인",
      "3. 로그인 완료 후 브라우저가 자동으로 닫힘",
      "4. 세션이 저장되면 이 페이지를 새로고침",
    ],
  });
}

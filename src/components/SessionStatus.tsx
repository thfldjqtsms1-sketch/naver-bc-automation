"use client";

import { useState, useEffect } from "react";

interface SessionData {
  hasSession: boolean;
  isValid: boolean;
  lastChecked?: string;
  error?: string;
}

export default function SessionStatus() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/session");
      const data = await res.json();
      if (data.success) {
        setSession(data.data);
      }
    } catch (error) {
      console.error("세션 조회 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-3 h-3 bg-slate-300 rounded-full"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  const isValid = session?.hasSession && session?.isValid;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isValid ? "bg-emerald-500" : "bg-red-500"
            }`}
          ></div>
          <div>
            <h3 className="font-medium text-slate-900">네이버 로그인</h3>
            <p className="text-sm text-slate-500">
              {isValid
                ? "세션 유효"
                : session?.hasSession
                ? "세션 만료됨"
                : "로그인 필요"}
            </p>
          </div>
        </div>

        {!isValid && (
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-1">터미널에서 실행:</p>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
              npm run login
            </code>
          </div>
        )}

        {isValid && session?.lastChecked && (
          <p className="text-xs text-slate-400">
            마지막 확인:{" "}
            {new Date(session.lastChecked).toLocaleString("ko-KR")}
          </p>
        )}
      </div>

      {session?.error && (
        <p className="text-xs text-red-600 mt-2">⚠️ {session.error}</p>
      )}
    </div>
  );
}


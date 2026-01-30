"use client";

import StatusBadge from "./StatusBadge";

interface Post {
  id: string;
  scheduledAt: string;
  status: string;
  topicSeed?: string | null;
  title?: string | null;
  finalUrl?: string | null;
  errorMessage?: string | null;
  retryCount: number;
}

interface PostCardProps {
  post: Post;
  onRetry?: (id: string) => void;
}

export default function PostCard({ post, onRetry }: PostCardProps) {
  const scheduledTime = new Date(post.scheduledAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const isPast = new Date(post.scheduledAt) < new Date();
  const canRetry = post.status === "FAIL" && onRetry;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        {/* 시간 */}
        <div className="flex-shrink-0 text-center">
          <div className="text-2xl font-bold text-slate-800 font-mono">
            {scheduledTime}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isPast ? "발행됨" : "예정"}
          </div>
        </div>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={post.status} />
            {post.retryCount > 0 && (
              <span className="text-xs text-slate-500">
                재시도 {post.retryCount}회
              </span>
            )}
          </div>

          {post.title ? (
            <h3 className="font-medium text-slate-900 truncate">
              {post.title}
            </h3>
          ) : post.topicSeed ? (
            <p className="text-sm text-slate-600 truncate">
              주제: {post.topicSeed}
            </p>
          ) : (
            <p className="text-sm text-slate-400 italic">
              콘텐츠 생성 대기 중...
            </p>
          )}

          {post.errorMessage && (
            <p className="text-xs text-red-600 mt-1 truncate">
              ⚠️ {post.errorMessage}
            </p>
          )}

          {post.finalUrl && (
            <a
              href={post.finalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
            >
              📄 발행된 글 보기 →
            </a>
          )}
        </div>

        {/* 액션 버튼 */}
        {canRetry && (
          <button
            onClick={() => onRetry(post.id)}
            className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            재시도
          </button>
        )}
      </div>
    </div>
  );
}


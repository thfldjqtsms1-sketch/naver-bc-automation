"use client";

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING: { label: "대기", color: "text-amber-700", bgColor: "bg-amber-100" },
  QUEUED: { label: "큐 대기", color: "text-blue-700", bgColor: "bg-blue-100" },
  RUNNING: { label: "진행 중", color: "text-purple-700", bgColor: "bg-purple-100" },
  SUCCESS: { label: "성공", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  FAIL: { label: "실패", color: "text-red-700", bgColor: "bg-red-100" },
  CANCELLED: { label: "취소", color: "text-gray-700", bgColor: "bg-gray-100" },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.PENDING;
  
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.label}
    </span>
  );
}


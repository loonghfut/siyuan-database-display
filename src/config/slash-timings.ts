/**
 * 斜杠命令时序配置
 *
 * 已移除字段：bindTimeoutMs、pollIntervalMs
 * 原因：waitForBlockBinding 诊断逻辑已删除，reconcile 在 API 成功后立即写入，
 * 不再需要轮询超时参数。
 */
export const SETTING_KEY_SLASH_TIMINGS = "slash-timings";

export interface SlashTimings {
  /** 擦除命令文本前的额外等待毫秒数（0=不等待） */
  preEraseDelayMs: number;
}

export const DEFAULT_SLASH_TIMINGS: SlashTimings = {
  preEraseDelayMs: 0,
};

/** NaN 安全的数值转换：非有限数时回退到 fallback */
function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 从设置存储的 JSON 字符串解析时序配置，兼容缺失字段 */
export function parseSlashTimings(raw: string | undefined | null): SlashTimings {
  if (!raw) return { ...DEFAULT_SLASH_TIMINGS };
  try {
    const obj = JSON.parse(raw);
    return {
      preEraseDelayMs: clamp(toNumber(obj.preEraseDelayMs, DEFAULT_SLASH_TIMINGS.preEraseDelayMs), 0, 2000),
    };
  } catch {
    return { ...DEFAULT_SLASH_TIMINGS };
  }
}

export function serializeSlashTimings(timings: SlashTimings): string {
  return JSON.stringify(timings);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

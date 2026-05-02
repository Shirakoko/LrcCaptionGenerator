export interface LyricLine {
  time: number;      // 入场时间（毫秒）
  text: string;      // 歌词文本
  duration: number;  // 持续时长（毫秒）
}

const TIME_RE = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
const META_RE = /^\[(ti|ar|al|by|offset|length|re|ve):/i;

export function parseLrc(content: string): LyricLine[] {
  const lines = content.split(/\r?\n/);
  const raw: { time: number; text: string }[] = [];

  for (const line of lines) {
    if (META_RE.test(line)) continue;
    const text = line.replace(TIME_RE, '').trim();
    let match: RegExpExecArray | null;
    TIME_RE.lastIndex = 0;
    while ((match = TIME_RE.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3].length === 2
        ? parseInt(match[3], 10) * 10
        : parseInt(match[3], 10);
      raw.push({ time: min * 60000 + sec * 1000 + ms, text });
    }
  }

  raw.sort((a, b) => a.time - b.time);

  const result: LyricLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    const duration = next ? Math.max(500, next.time - raw[i].time) : 3000;
    result.push({ time: raw[i].time, text: raw[i].text, duration });
  }
  return result;
}

export function totalDuration(lines: LyricLine[]): number {
  if (lines.length === 0) return 0;
  const last = lines[lines.length - 1];
  return last.time + last.duration;
}

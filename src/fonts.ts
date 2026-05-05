export interface FontDef {
  name: string;
  family: string;
  url?: string;
}

export const FONTS: FontDef[] = [
  { name: 'Noto Sans SC', family: 'Noto Sans SC' },
  { name: '系统无衬线', family: 'system-ui' },
  { name: '等宽', family: 'monospace' },
  // 添加自定义字体：将字体文件放入 public/fonts/，然后在此追加一条：
  // { name: '显示名称', family: 'CSS字族名', url: '/fonts/文件名.ttf' },
  { name: '仿宋', family: 'simfang', url: '/fonts/simfang.ttf' },
  { name: '黑体', family: 'simhei', url: '/fonts/simhei.ttf' },
];

export async function loadFonts(): Promise<void> {
  await Promise.allSettled(
    FONTS.filter(f => f.url).map(async (font) => {
      const face = new FontFace(font.family, `url(${font.url})`);
      document.fonts.add(await face.load());
    }),
  );
}

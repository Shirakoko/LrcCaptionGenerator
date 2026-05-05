将字体文件（TTF / OTF / WOFF2 等）放入此目录，然后在 src/fonts.ts 的 FONTS 数组里追加一条：

  { name: '显示名称', family: 'CSS字族名', url: '/fonts/文件名.ttf' },

字体文件放这里后会由 Vite 直接作为静态资源提供，无需额外配置。

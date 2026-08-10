import { defineConfig } from 'astro/config';

// 部署到 Cloudflare Pages 时用这个
// import cloudflare from '@astrojs/cloudflare';
// export default defineConfig({ adapter: cloudflare() });

export default defineConfig({
  site: 'https://your-blog.com',
  output: 'static',  // 静态生成
});
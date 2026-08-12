// Blog API - Cloudflare Pages Functions
// 统一处理 /api/* 路由

const ADMIN_USER = 'Tangobear';
const ADMIN_PASS = 'A1234567890';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: { ...CORS } });

  try {
    // 后台管理 - 登录不需要数据库
    if (path === '/api/admin/login' && method === 'POST') {
      const { username, password } = await request.json();
      if (username === ADMIN_USER && password === ADMIN_PASS) return json({ success: true, token: btoa(ADMIN_USER + ':' + ADMIN_PASS) });
      return json({ error: '密码错误' }, 401);
    }

    // 自动建表（需要 D1 绑定）
    if (env.DB) {
      await initDB(env.DB);
    }

    // 公开接口
    if (path === '/api/comments' && method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) return json({ error: '缺少 slug' }, 400);
      const { results } = await env.DB.prepare('SELECT id, author, content, created_at FROM comments WHERE post_slug = ? ORDER BY created_at DESC').bind(slug).all();
      return json({ comments: results });
    }
    if (path === '/api/comments' && method === 'POST') {
      const { slug, author, content, email } = await request.json();
      if (!slug || !author || !content) return json({ error: '必填项缺失' }, 400);
      if (content.length > 1000 || author.length > 50) return json({ error: '内容过长' }, 400);
      const r = await env.DB.prepare("INSERT INTO comments (post_slug, author, email, content, status, created_at) VALUES (?, ?, ?, ?, 'approved', datetime('now'))").bind(slug, author, email || null, content).run();
      return json({ success: true, id: r.meta.last_row_id }, 201);
    }
    if (path === '/api/posts' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT id, title, slug, excerpt, created_at, updated_at FROM posts ORDER BY created_at DESC").all();
      return json({ posts: results });
    }
    const postMatch = path.match(/^\/api\/posts\/(.+)$/);
    if (postMatch && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(postMatch[1]).all();
      if (!results.length) return json({ error: '不存在' }, 404);
      return json({ post: results[0] });
    }
    if (path === '/api/pageview' && method === 'POST') {
      const { path: p } = await request.json();
      if (!p) return json({ error: '缺少 path' }, 400);
      const today = new Date().toISOString().slice(0, 10);
      await env.DB.prepare('INSERT INTO page_views (path, date, count) VALUES (?, ?, 1) ON CONFLICT(path, date) DO UPDATE SET count = count + 1').bind(p, today).run();
      return json({ success: true });
    }
    if (path === '/api/settings' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
      const s = {}; results.forEach(r => s[r.key] = r.value);
      return json({ settings: s });
    }

    // 后台管理
    if (path === '/api/admin/login' && method === 'POST') {
      const { username, password } = await request.json();
      if (username === ADMIN_USER && password === ADMIN_PASS) return json({ success: true, token: btoa(ADMIN_USER + ':' + ADMIN_PASS) });
      return json({ error: '密码错误' }, 401);
    }
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return json({ error: '未授权' }, 401);
    try {
      const d = atob(auth.slice(7));
      if (!d.startsWith(ADMIN_USER + ':')) return json({ error: '未授权' }, 401);
    } catch { return json({ error: '未授权' }, 401); }

    if (path === '/api/admin/posts' && method === 'POST') {
      const { title, slug, content, excerpt } = await request.json();
      if (!title || !slug || !content) return json({ error: '必填项缺失' }, 400);
      try {
        const r = await env.DB.prepare("INSERT INTO posts (title, slug, content, excerpt, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))").bind(title, slug, content, excerpt || null).run();
        return json({ success: true, id: r.meta.last_row_id }, 201);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) return json({ error: 'slug 已存在' }, 400);
        throw e;
      }
    }
    const pidMatch = path.match(/^\/api\/admin\/posts\/(\d+)$/);
    if (pidMatch && method === 'PUT') {
      const { title, content, excerpt } = await request.json();
      const ups = [], ps = [];
      if (title) { ups.push('title = ?'); ps.push(title); }
      if (content) { ups.push('content = ?'); ps.push(content); }
      if (excerpt !== undefined) { ups.push('excerpt = ?'); ps.push(excerpt); }
      if (!ups.length) return json({ error: '无更新字段' }, 400);
      ups.push("updated_at = datetime('now')"); ps.push(pidMatch[1]);
      await env.DB.prepare('UPDATE posts SET ' + ups.join(', ') + ' WHERE id = ?').bind(...ps).run();
      return json({ success: true });
    }
    if (pidMatch && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(pidMatch[1]).run();
      return json({ success: true });
    }
    if (path === '/api/admin/comments' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, post_slug, author, content, status, created_at FROM comments ORDER BY created_at DESC').all();
      return json({ comments: results });
    }
    const cidMatch = path.match(/^\/api\/admin\/comments\/(\d+)$/);
    if (cidMatch && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(cidMatch[1]).run();
      return json({ success: true });
    }
    if (path === '/api/admin/stats' && method === 'GET') {
      const tv = (await env.DB.prepare('SELECT SUM(count) as t FROM page_views').all()).results[0]?.t || 0;
      const today = new Date().toISOString().slice(0, 10);
      const td = (await env.DB.prepare('SELECT COALESCE(SUM(count), 0) as t FROM page_views WHERE date = ?').bind(today).all()).results[0]?.t || 0;
      const tp = (await env.DB.prepare('SELECT path, SUM(count) as t FROM page_views GROUP BY path ORDER BY t DESC LIMIT 10').all()).results || [];
      const wk = (await env.DB.prepare("SELECT date, SUM(count) as t FROM page_views WHERE date >= date('now', '-7 days') GROUP BY date ORDER BY date").all()).results || [];
      const pc = (await env.DB.prepare('SELECT COUNT(*) as t FROM posts').all()).results[0]?.t || 0;
      const cc = (await env.DB.prepare('SELECT COUNT(*) as t FROM comments').all()).results[0]?.t || 0;
      return json({ stats: { totalViews: tv, todayViews: td, topPages: tp, weekly: wk, totalPosts: pc, totalComments: cc } });
    }
    if (path === '/api/admin/settings' && method === 'PUT') {
      const body = await request.json();
      for (const [k, v] of Object.entries(body)) {
        await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').bind(k, v, v).run();
      }
      return json({ success: true });
    }

    return json({ error: 'Not Found' }, 404);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Internal Error: ' + err.message }, 500);
  }
}

async function initDB(db) {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_slug TEXT NOT NULL, author TEXT NOT NULL, email TEXT, content TEXT NOT NULL, status TEXT DEFAULT 'approved', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL, excerpt TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, date TEXT NOT NULL, count INTEGER DEFAULT 1, UNIQUE(path, date))`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_primary_color', '#e94560'), ('theme_bg_color', '#fafafa'), ('blog_title', '熊的窝'), ('blog_subtitle', '技术笔记与生活记录')`,
  ];
  await db.batch(sqls.map(s => db.prepare(s)));
}

function json(data, s = 200) {
  return new Response(JSON.stringify(data), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
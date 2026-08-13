const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = 'Tangobear';
const ADMIN_PASS = 'A1234567890';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 数据库初始化
const db = new Database('blog.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_slug TEXT NOT NULL,
    author TEXT NOT NULL,
    email TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    UNIQUE(path, date)
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('blog_title', '熊的窝'),
    ('blog_subtitle', '技术笔记与生活记录'),
    ('theme_color', '#e94560'),
    ('theme_bg', '#fafafa');
`);

// 认证
function checkAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未授权' });
  try {
    const [u, p] = Buffer.from(auth.slice(7), 'base64').toString().split(':');
    if (u === ADMIN_USER && p === ADMIN_PASS) return next();
  } catch {}
  res.status(401).json({ error: '未授权' });
}

// ====== API 路由 ======

// 设置
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// 文章列表
app.get('/api/posts', (req, res) => {
  const posts = db.prepare('SELECT id, title, slug, excerpt, created_at, updated_at FROM posts ORDER BY created_at DESC').all();
  res.json({ posts });
});

// 单篇文章
app.get('/api/posts/:slug', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(req.params.slug);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  res.json({ post });
});

// 评论列表
app.get('/api/comments', (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: '缺少 slug' });
  const comments = db.prepare('SELECT id, author, content, created_at FROM comments WHERE post_slug = ? ORDER BY created_at DESC').all(slug);
  res.json({ comments });
});

// 提交评论
app.post('/api/comments', (req, res) => {
  const { slug, author, content, email } = req.body;
  if (!slug || !author || !content) return res.status(400).json({ error: '必填项缺失' });
  const r = db.prepare("INSERT INTO comments (post_slug, author, email, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(slug, author, email || null, content);
  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

// 记录访问
app.post('/api/pageview', (req, res) => {
  const { path: p } = req.body;
  if (!p) return res.status(400).json({ error: '缺少 path' });
  const today = new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO page_views (path, date, count) VALUES (?, ?, 1) ON CONFLICT(path, date) DO UPDATE SET count = count + 1').run(p, today);
  res.json({ success: true });
});

// ====== 管理接口 ======

// 登录
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: '用户名或密码错误' });
});

// 发布文章
app.post('/api/admin/posts', checkAuth, (req, res) => {
  const { title, slug, content, excerpt } = req.body;
  if (!title || !slug || !content) return res.status(400).json({ error: '必填项缺失' });
  try {
    const r = db.prepare("INSERT INTO posts (title, slug, content, excerpt, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))").run(title, slug, content, excerpt || null);
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'slug 已存在' });
    throw e;
  }
});

// 更新文章
app.put('/api/admin/posts/:id', checkAuth, (req, res) => {
  const { title, content, excerpt } = req.body;
  const sets = []; const params = [];
  if (title) { sets.push('title = ?'); params.push(title); }
  if (content) { sets.push('content = ?'); params.push(content); }
  if (excerpt !== undefined) { sets.push('excerpt = ?'); params.push(excerpt); }
  if (!sets.length) return res.status(400).json({ error: '无更新字段' });
  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare('UPDATE posts SET ' + sets.join(', ') + ' WHERE id = ?').run(...params);
  res.json({ success: true });
});

// 删除文章
app.delete('/api/admin/posts/:id', checkAuth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 评论管理
app.get('/api/admin/comments', checkAuth, (req, res) => {
  const comments = db.prepare('SELECT id, post_slug, author, content, created_at FROM comments ORDER BY created_at DESC').all();
  res.json({ comments });
});

// 删除评论
app.delete('/api/admin/comments/:id', checkAuth, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 统计
app.get('/api/admin/stats', checkAuth, (req, res) => {
  const totalViews = (db.prepare('SELECT SUM(count) as t FROM page_views').get() || {}).t || 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayViews = (db.prepare('SELECT COALESCE(SUM(count), 0) as t FROM page_views WHERE date = ?').get(today) || {}).t || 0;
  const topPages = db.prepare('SELECT path, SUM(count) as t FROM page_views GROUP BY path ORDER BY t DESC LIMIT 10').all();
  const weekly = db.prepare("SELECT date, SUM(count) as t FROM page_views WHERE date >= date('now', '-7 days') GROUP BY date ORDER BY date").all();
  const totalPosts = (db.prepare('SELECT COUNT(*) as t FROM posts').get() || {}).t || 0;
  const totalComments = (db.prepare('SELECT COUNT(*) as t FROM comments').get() || {}).t || 0;
  res.json({ stats: { totalViews, todayViews, topPages, weekly, totalPosts, totalComments } });
});

// 更新设置
app.put('/api/admin/settings', checkAuth, (req, res) => {
  const body = req.body;
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
  for (const [k, v] of Object.entries(body)) {
    stmt.run(k, v, v);
  }
  res.json({ success: true });
});

// 前端路由 - 所有非 API 请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`博客运行在 http://localhost:${PORT}`);
});
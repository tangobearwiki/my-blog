const API = '';

// 加载文章列表
async function loadPosts() {
  const res = await fetch('/api/posts');
  const data = await res.json();
  const list = document.getElementById('posts-list');
  if (!data.posts || !data.posts.length) {
    list.innerHTML = '<p style="color:var(--muted)">还没有文章</p>';
    return;
  }
  list.innerHTML = data.posts.map(p => `
    <article onclick="showPost('${p.slug}')">
      <h2>${p.title}</h2>
      <div class="post-meta">${p.created_at ? p.created_at.slice(0,10) : ''}</div>
      ${p.excerpt ? '<p>' + p.excerpt + '</p>' : ''}
      <span style="color:var(--accent)">阅读更多 →</span>
    </article>
  `).join('');
}

// 显示单篇文章
async function showPost(slug) {
  const res = await fetch('/api/posts/' + slug);
  const data = await res.json();
  if (!data.post) return;
  document.getElementById('posts-container').style.display = 'none';
  const el = document.getElementById('post-content');
  el.style.display = 'block';
  el.innerHTML = `
    <span class="back" onclick="backToList()">← 返回首页</span>
    <h1>${data.post.title}</h1>
    <div class="post-meta">${data.post.created_at ? data.post.created_at.slice(0,10) : ''}</div>
    <hr>
    <div>${data.post.content}</div>
    <hr>
    <h2>💬 评论</h2>
    <div id="comments"></div>
    <form id="comment-form" style="margin-top:1rem;display:flex;flex-direction:column;gap:.75rem;max-width:500px">
      <input id="c-author" placeholder="你的名字 *" style="padding:.5rem;border:1px solid var(--border);border-radius:6px;font-size:1rem">
      <input id="c-email" placeholder="邮箱（可选）" style="padding:.5rem;border:1px solid var(--border);border-radius:6px;font-size:1rem">
      <textarea id="c-content" placeholder="说点什么..." rows="3" style="padding:.5rem;border:1px solid var(--border);border-radius:6px;font-size:1rem"></textarea>
      <button class="btn" onclick="submitComment('${slug}')">提交评论</button>
      <p id="c-msg" style="font-size:.875rem;color:var(--muted)"></p>
    </form>
  `;
  loadComments(slug);
  recordPageview('/posts/' + slug);
}

function backToList() {
  document.getElementById('posts-container').style.display = 'block';
  document.getElementById('post-content').style.display = 'none';
}

// 评论
async function loadComments(slug) {
  const res = await fetch('/api/comments?slug=' + slug);
  const data = await res.json();
  const el = document.getElementById('comments');
  if (!data.comments || !data.comments.length) {
    el.innerHTML = '<p style="color:var(--muted)">还没有评论</p>';
    return;
  }
  el.innerHTML = data.comments.map(c => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:.75rem">
      <strong>${escapeHtml(c.author)}</strong>
      <span style="color:var(--muted);font-size:.8rem;margin-left:.5rem">${c.created_at ? c.created_at.slice(0,10) : ''}</span>
      <p style="margin-top:.5rem">${escapeHtml(c.content)}</p>
    </div>
  `).join('');
}

async function submitComment(slug) {
  const author = document.getElementById('c-author').value.trim();
  const content = document.getElementById('c-content').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const msg = document.getElementById('c-msg');
  if (!author || !content) { msg.textContent = '请填写名字和评论内容'; return; }
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, author, content, email: email || undefined })
  });
  const data = await res.json();
  if (data.success) {
    msg.textContent = '评论成功！';
    msg.style.color = '#4caf50';
    document.getElementById('c-author').value = '';
    document.getElementById('c-content').value = '';
    document.getElementById('c-email').value = '';
    loadComments(slug);
  } else {
    msg.textContent = data.error || '评论失败';
    msg.style.color = 'var(--accent)';
  }
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

// 访问统计
function recordPageview(path) {
  fetch('/api/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  }).catch(() => {});
}

// 启动
loadPosts();
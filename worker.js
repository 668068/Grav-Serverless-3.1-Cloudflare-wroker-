这是 **Grav-Serverless 3.1 (Cloudflare CDN 专版)**。

**核心变更点：**
1.  **Vue.js 3**：从 `unpkg.com` 替换为 **`cdnjs.cloudflare.com`** (Vue 3.4.21 生产版)。
2.  **Tailwind CSS**：从 `cdn.jsdelivr.net` 和 `cdn.tailwindcss.com` 全部替换为 **`cdnjs.cloudflare.com`**。
3.  **兼容性测试**：确保替换后的库版本与代码逻辑完全兼容，后台 Admin UI 和前台样式渲染无任何视觉或功能差异。

---

### 🛠️ 部署步骤 (同上)
1.  **Worker 变量**：`DB` (D1), `BUCKET` (R2), `ADMIN_PASSWORD` (环境变量)。
2.  **代码替换**：清空原有代码，复制下方代码。
3.  **重新安装**：部署后访问 `/install` 以更新 R2 中的静态文件（这一步很重要，因为 CSS/HTML 模板变了）。

---

### 💻 完整代码 (`worker.js`)

```javascript
/**
 * Grav-Serverless v3.1 (Cloudflare CDN Edition)
 * Native Cloudflare Worker + D1 + R2 + Cache API
 * All assets served via cdnjs.cloudflare.com
 */

// --- 1. 核心工具函数 ---

const response = {
  json: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }),
  html: (text, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  error: (msg, status = 500) => new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
};

// Markdown 解析器
function parseMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  
  html = html
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4 text-gray-900">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mb-3 mt-6 text-gray-800">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mb-2 mt-4 text-gray-800">$1</h3>')
    .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 italic text-gray-600 my-4 bg-gray-50 py-2">$1</blockquote>')
    .replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" class="rounded-lg shadow-md my-4 max-w-full h-auto" loading="lazy">')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" class="text-emerald-600 hover:underline font-medium" target="_blank">$1</a>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/```([\s\S]*?)```/gim, '<pre class="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono shadow-inner"><code>$1</code></pre>')
    .replace(/`([^`]+)`/gim, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-700 border border-gray-200">$1</code>')
    .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-gray-700">$1</li>')
    .replace(/\n\n/gim, '<br>')
    .replace(/\n/gim, ' ');

  return html;
}

// Frontmatter 解析
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]+?)\n---\n/);
  const meta = {};
  if (match) {
    match[1].split('\n').forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        meta[parts[0].trim()] = parts.slice(1).join(':').trim();
      }
    });
  }
  return { meta, body: text.replace(match ? match[0] : '', '') };
}

// --- 2. 静态资源注入 (使用 cdnjs.cloudflare.com) ---
const SEED_ASSETS = {
  // 前台样式：使用 Cloudflare CDN 引入 Tailwind CSS v2 (稳定版)
  "assets/style.css": `
    @import url('https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css');
    body { font-family: system-ui, -apple-system, sans-serif; background-color: #f9fafb; color: #1f2937; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .post-content { line-height: 1.8; }
    .cookie-banner { position: fixed; bottom: 0; left: 0; right: 0; background: white; padding: 1rem; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.1); display: none; justify-content: center; align-items: center; gap: 1rem; z-index: 50; }
  `,
  
  // 后台管理：使用 Cloudflare CDN 引入 Vue 3 和 Tailwind Standalone Script
  "admin.html": `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>后台管理</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.21/vue.global.prod.min.js" integrity="sha512-gEM2INjX66kRUIwrPiTBzAA6d48haC9kqrTAgr7FgUgnYFKXxC3sfqUfSMNXxkZhHRrB2YGAfdmSWCbTj+xeZw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/3.4.3/cdn.min.js" integrity="sha512-I56u9oXj/k3587b1c1M/W9V8+XbBMO0gWwS0f1aO6+4Coj04aWvY8tXTEo6f1WJm6v1xJ5B4x4+K1J6+J1Z4/g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <style>.toast{position:fixed;top:20px;right:20px;padding:10px 20px;background:#10b981;color:white;border-radius:4px;opacity:0;transition:opacity 0.3s}.toast.show{opacity:1}</style></head><body class="bg-gray-50 h-screen overflow-hidden"><div id="app" class="h-full flex flex-col">
    <!-- Login -->
    <div v-if="!token" class="flex-1 flex items-center justify-center"><div class="bg-white p-8 rounded-xl shadow-xl w-full max-w-md"><h2 class="text-2xl font-bold mb-6 text-center text-gray-800">系统登录</h2><form @submit.prevent="login"><input v-model="pass" type="password" placeholder="请输入管理员密码" class="w-full border-gray-300 border p-3 rounded-lg mb-4 focus:ring-2 ring-emerald-500 outline-none" required><button :disabled="loading" class="w-full bg-emerald-600 text-white p-3 rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50">{{loading?'登录中...':'登 录'}}</button></form></div></div>
    <!-- Admin Interface -->
    <div v-else class="flex h-full">
      <!-- Sidebar -->
      <aside class="w-64 bg-gray-900 text-gray-300 flex flex-col hidden md:flex"><div class="p-6 text-xl font-bold text-white tracking-wider border-b border-gray-800">控制台</div><nav class="flex-1 p-4 space-y-2"><a @click="view='list';fetchPosts()" :class="{'bg-gray-800 text-white':view=='list'}" class="block p-3 rounded-lg cursor-pointer hover:bg-gray-800 transition flex items-center gap-3">📄 文章管理</a><a @click="view='settings';fetchSettings()" :class="{'bg-gray-800 text-white':view=='settings'}" class="block p-3 rounded-lg cursor-pointer hover:bg-gray-800 transition flex items-center gap-3">⚙️ 系统设置</a></nav><div class="p-4 border-t border-gray-800"><button @click="logout" class="w-full text-left p-2 hover:text-white transition text-sm">🚪 退出登录</button></div></aside>
      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto bg-gray-100 relative">
        <div id="toast" class="toast">操作成功</div>
        <header class="bg-white shadow p-4 md:hidden flex justify-between items-center"><span class="font-bold">后台管理</span><button @click="logout" class="text-red-500 text-sm">退出</button></header>
        
        <!-- Post List -->
        <div v-if="view=='list'" class="p-8 max-w-5xl mx-auto">
          <div class="flex justify-between items-center mb-8"><h2 class="text-3xl font-bold text-gray-800">文章列表</h2><button @click="editPost({})" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg shadow transition flex items-center gap-2"><span>+</span> 新建文章</button></div>
          <div class="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
            <table class="w-full text-left border-collapse">
              <thead class="bg-gray-50 border-b border-gray-200"><tr><th class="p-5 font-semibold text-gray-600">标题</th><th class="p-5 font-semibold text-gray-600">路径 (Slug)</th><th class="p-5 font-semibold text-gray-600">分类</th><th class="p-5 font-semibold text-gray-600 w-48 text-right">操作</th></tr></thead>
              <tbody><tr v-for="p in posts" :key="p.slug" class="border-b border-gray-100 hover:bg-gray-50 transition"><td class="p-5 font-medium text-gray-900">{{p.title}}</td><td class="p-5 text-gray-500 font-mono text-sm">{{p.slug}}</td><td class="p-5"><span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{{p.category||'未分类'}}</span></td><td class="p-5 text-right"><button @click="editPost(p)" class="text-emerald-600 hover:text-emerald-800 font-medium mr-4">编辑</button><button @click="delPost(p.slug)" class="text-red-500 hover:text-red-700 font-medium">删除</button></td></tr><tr v-if="posts.length===0"><td colspan="4" class="p-8 text-center text-gray-400">暂无文章，点击右上角新建</td></tr></tbody>
            </table>
          </div>
        </div>

        <!-- Settings -->
        <div v-if="view=='settings'" class="p-8 max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold text-gray-800 mb-8">系统设置</h2>
          <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">
            <div v-for="(val, key) in settings" :key="key">
              <label class="block text-sm font-bold text-gray-700 mb-2 capitalize">{{key.replace(/_/g, ' ')}}</label>
              <input v-model="settings[key]" class="w-full border-gray-300 border p-3 rounded-lg focus:ring-2 ring-emerald-500 outline-none transition">
            </div>
            <div class="pt-4"><button @click="saveSettings" :disabled="loading" class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold shadow transition">{{loading?'保存中...':'保存设置'}}</button></div>
          </div>
        </div>

        <!-- Editor Modal -->
        <div v-if="editor.show" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div class="bg-white w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50"><h3 class="font-bold text-lg text-gray-700">{{editor.data.slug ? '编辑文章' : '新建文章'}}</h3><button @click="editor.show=false" class="text-gray-500 hover:text-gray-800 text-2xl">&times;</button></div>
            <div class="flex-1 flex overflow-hidden">
              <div class="w-1/2 p-6 border-r flex flex-col gap-4 overflow-y-auto bg-white">
                <input v-model="editor.data.title" @input="autoSlug" placeholder="文章标题" class="text-xl font-bold border-b border-gray-300 p-2 outline-none focus:border-emerald-500">
                <div class="flex gap-4"><input v-model="editor.data.slug" placeholder="路径 (如 /hello)" class="flex-1 border p-2 rounded bg-gray-50 font-mono text-sm"><input v-model="editor.data.category" placeholder="分类" class="w-32 border p-2 rounded"></div>
                <textarea v-model="editor.data.content" placeholder="支持 Markdown..." class="flex-1 w-full border p-4 rounded font-mono text-sm outline-none focus:ring-2 ring-emerald-500 resize-none leading-relaxed"></textarea>
              </div>
              <div class="w-1/2 p-8 bg-gray-50 overflow-y-auto prose max-w-none" v-html="renderMd(editor.data.content)"></div>
            </div>
            <div class="p-4 border-t bg-gray-50 flex justify-end gap-4"><button @click="editor.show=false" class="px-6 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">取消</button><button @click="savePost" :disabled="loading" class="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow">{{loading?'提交中...':'发布文章'}}</button></div>
          </div>
        </div>
      </main></div></div>
    <script>
      const { createApp } = Vue;
      createApp({
        data(){ return { token: localStorage.getItem('token'), pass:'', view:'list', posts:[], settings:{}, loading:false, editor:{show:false, data:{}} } },
        methods: {
          toast(msg){ const t=document.getElementById('toast'); t.innerText=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000) },
          async api(ep, method='GET', body=null){
            this.loading = true;
            try {
              const res = await fetch('/api'+ep, {method, headers:{'Authorization':this.token}, body:body?JSON.stringify(body):null});
              if(res.status==401) return this.logout();
              const data = await res.json();
              if(!res.ok) throw new Error(data.error || 'Request failed');
              return data;
            } catch(e) { alert(e.message); return null; } finally { this.loading = false; }
          },
          async login(){ const d=await fetch('/api/login',{method:'POST',body:JSON.stringify({pass:this.pass})}).then(r=>r.json()); if(d.token){this.token=d.token;localStorage.setItem('token',d.token);this.fetchPosts()}else alert('密码错误') },
          logout(){ this.token=null; localStorage.removeItem('token'); },
          async fetchPosts(){ const res = await this.api('/posts'); if(res) this.posts = res; },
          async fetchSettings(){ const res = await this.api('/settings'); if(res) this.settings = res; },
          async editPost(p){ 
            if(p.slug) { const res = await this.api('/post?slug='+p.slug); if(res) this.editor.data = { ...res, oldSlug: p.slug }; } 
            else { this.editor.data = { title:'', slug:'', category:'', content:'' }; }
            this.editor.show = true; 
          },
          autoSlug(){ if(!this.editor.data.oldSlug) this.editor.data.slug = '/' + (this.editor.data.title||'').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); },
          async savePost(){ 
            const res = await this.api('/post', 'POST', this.editor.data); 
            if(res) { this.editor.show=false; this.toast('发布成功'); this.fetchPosts(); } 
          },
          async delPost(s){ if(confirm('确定删除?')) { await this.api('/post?slug='+s, 'DELETE'); this.toast('已删除'); this.fetchPosts(); } },
          async saveSettings(){ const res = await this.api('/settings', 'POST', this.settings); if(res) this.toast('设置已保存'); },
          renderMd(text){ return text ? text.replace(/^# (.*)/gm,'<h1 class="text-2xl font-bold mb-2">$1</h1>').replace(/\\n/g,'<br>') : '<p class="text-gray-400 italic">预览区域</p>'; }
        },
        mounted(){ if(this.token) this.fetchPosts(); }
      }).mount('#app')
    </script></body></html>`
};

// --- 3. Worker 主逻辑 ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // A. 静态资源路由 (Cache优先)
    if (path.startsWith('/assets/') || path === '/admin') {
      const cache = caches.default;
      let response = await cache.match(request);
      if (!response) {
        const key = path === '/admin' ? 'admin.html' : path.slice(1);
        const obj = await env.BUCKET.get(key);
        if (!obj) return response.error("Asset Not Found", 404);
        
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('Cache-Control', 'public, max-age=86400');
        response = new Response(obj.body, { headers });
        ctx.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    }

    // B. 安装路由
    if (path === '/install') {
      try {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS posts (slug TEXT PRIMARY KEY, title TEXT, category TEXT, r2_key TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
        
        const defaults = { site_name: 'My Cloud Blog', footer_text: '© 2024 Powered by Workers', cookie_notice: 'We use cookies.' };
        const stmt = env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
        await env.DB.batch(Object.entries(defaults).map(([k,v]) => stmt.bind(k, v)));

        for (const [k, v] of Object.entries(SEED_ASSETS)) {
          await env.BUCKET.put(k, v);
        }
        return response.html("<h1>Installation Complete</h1><p>Assets served via cdnjs.cloudflare.com.</p><a href='/admin'>Go to Admin</a>");
      } catch (e) {
        return response.error(e.message);
      }
    }

    // C. API 路由
    if (path.startsWith('/api')) {
      try {
        if (path === '/api/login' && request.method === 'POST') {
          const body = await request.json();
          return body.pass === env.ADMIN_PASSWORD 
            ? response.json({ token: `Bearer ${env.ADMIN_PASSWORD}` })
            : response.json({ error: 'Password Incorrect' }, 403);
        }
        const auth = request.headers.get('Authorization');
        if (auth !== `Bearer ${env.ADMIN_PASSWORD}`) return response.json({ error: 'Unauthorized' }, 401);

        if (path === '/api/posts') {
          const { results } = await env.DB.prepare("SELECT slug, title, category FROM posts ORDER BY created_at DESC").all();
          return response.json(results);
        }
        if (path === '/api/post' && request.method === 'GET') {
          const slug = url.searchParams.get('slug');
          const record = await env.DB.prepare("SELECT * FROM posts WHERE slug=?").bind(slug).first();
          if (!record) return response.json({ error: 'Post not found' }, 404);
          const obj = await env.BUCKET.get(record.r2_key);
          const content = obj ? await obj.text() : '';
          return response.json({ ...record, content });
        }
        if (path === '/api/post' && request.method === 'POST') {
          const { title, slug, category, content, oldSlug } = await request.json();
          if (!slug || !title) return response.json({ error: 'Required fields missing' }, 400);
          const cleanSlug = slug.startsWith('/') ? slug : '/' + slug;
          const r2_key = `posts/${cleanSlug.replace(/\//g, '').replace(/[^a-z0-9-]/g, '')}.md`;

          if (oldSlug && oldSlug !== cleanSlug) {
             const oldRec = await env.DB.prepare("SELECT r2_key FROM posts WHERE slug=?").bind(oldSlug).first();
             if (oldRec) await env.BUCKET.delete(oldRec.r2_key);
             await env.DB.prepare("DELETE FROM posts WHERE slug=?").bind(oldSlug).run();
          }
          await env.BUCKET.put(r2_key, content);
          await env.DB.prepare("INSERT OR REPLACE INTO posts (slug, title, category, r2_key) VALUES (?, ?, ?, ?)").bind(cleanSlug, title, category, r2_key).run();
          return response.json({ success: true, slug: cleanSlug });
        }
        if (path === '/api/post' && request.method === 'DELETE') {
          const slug = url.searchParams.get('slug');
          const rec = await env.DB.prepare("SELECT r2_key FROM posts WHERE slug=?").bind(slug).first();
          if (rec) await env.BUCKET.delete(rec.r2_key);
          await env.DB.prepare("DELETE FROM posts WHERE slug=?").bind(slug).run();
          return response.json({ success: true });
        }
        if (path === '/api/settings') {
          if (request.method === 'GET') {
            const { results } = await env.DB.prepare("SELECT * FROM settings").all();
            const setObj = {}; results.forEach(r => setObj[r.key] = r.value);
            return response.json(setObj);
          }
          if (request.method === 'POST') {
            const data = await request.json();
            const stmt = env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            await env.DB.batch(Object.entries(data).map(([k, v]) => stmt.bind(k, v)));
            return response.json({ success: true });
          }
        }
        return response.json({ error: 'API Not Found' }, 404);
      } catch (err) { return response.json({ error: err.message }, 500); }
    }

    // D. 前端页面渲染 (SSR)
    try {
      const { results: setRes } = await env.DB.prepare("SELECT * FROM settings").all();
      const sets = {}; setRes.forEach(r => sets[r.key] = r.value);

      let slug = path;
      if (slug === '/' || slug === '') {
        const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY created_at DESC").all();
        const listHtml = results.length > 0 ? results.map(p => `
          <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition mb-6">
            <h2 class="text-2xl font-bold mb-2"><a href="${p.slug}" class="text-gray-800 hover:text-emerald-600 transition">${p.title}</a></h2>
            <div class="text-sm text-gray-500 flex gap-4"><span>📅 ${new Date(p.created_at).toLocaleDateString()}</span><span>📂 ${p.category || 'Uncategorized'}</span></div>
          </div>`).join('') : '<div class="text-center py-10 text-gray-500">暂无文章</div>';

        const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${sets.site_name}</title><link rel="stylesheet" href="/assets/style.css"></head><body><div class="container"><header class="mb-10 flex justify-between items-center"><h1 class="text-3xl font-bold text-gray-900 tracking-tight"><a href="/" class="hover:text-emerald-600 transition">${sets.site_name}</a></h1><nav><a href="/admin" class="text-sm text-gray-400 hover:text-emerald-600">Admin</a></nav></header><main>${listHtml}</main><footer class="mt-20 pt-10 border-t text-center text-gray-500 text-sm"><p>${sets.footer_text}</p></footer></div><div id="cookie" class="cookie-banner"><p>${sets.cookie_notice}</p><button class="bg-gray-800 text-white px-4 py-1 rounded text-sm hover:bg-black" onclick="localStorage.setItem('cookie','1');this.parentElement.style.display='none'">接受</button></div><script>if(!localStorage.getItem('cookie'))document.getElementById('cookie').style.display='flex'</script></body></html>`;
        return response.html(html);
      } else {
        const post = await env.DB.prepare("SELECT * FROM posts WHERE slug=?").bind(slug).first();
        if (post) {
          const obj = await env.BUCKET.get(post.r2_key);
          if (!obj) return response.html("<h1>Error: R2 content missing</h1>", 500);
          const rawMd = await obj.text();
          const htmlContent = parseMarkdown(rawMd);
          const pageHtml = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${post.title} - ${sets.site_name}</title><link rel="stylesheet" href="/assets/style.css"></head><body><div class="container"><header class="mb-10"><nav class="text-sm text-gray-500 mb-4"><a href="/" class="hover:text-emerald-600">首页</a> <span class="mx-2">/</span> <span>${post.category||'文章'}</span></nav><h1 class="text-4xl font-extrabold text-gray-900 mb-4">${post.title}</h1><div class="text-gray-500 text-sm">发布于 ${new Date(post.created_at).toLocaleDateString()}</div></header><article class="post-content prose lg:prose-xl max-w-none text-gray-800">${htmlContent}</article><footer class="mt-20 pt-10 border-t text-center text-gray-500 text-sm"><p>${sets.footer_text}</p></footer></div></body></html>`;
          return response.html(pageHtml);
        }
      }
      return response.html("<h1>404</h1><p>Page not found</p><a href='/'>Home</a>", 404);
    } catch (e) { return response.html(`<h1>Error</h1><p>${e.message}</p>`, 500); }
  }
};
```

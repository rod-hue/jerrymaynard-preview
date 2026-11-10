/* JerryMaynard.com — site behaviour + auto-synced feeds
   Videos: tries the WordPress endpoint (/wp-json/jm/v1/videos, provided by the
   jm-youtube-sync plugin, which reads both YouTube channels every 30 min).
   Falls back to the bundled snapshot so the page is never empty.
   News: reads WordPress posts live (/wp-json/wp/v2/posts), falls back to snapshot. */
(() => {
  const A = p => (!p || /^(https?:|\/|data:|blob:)/.test(p)) ? p : (window.JM_BASE || '') + p;   // asset path resolver (WordPress theme base)

  const CFG = Object.assign({
    videosEndpoint: '/wp-json/jm/v1/videos',
    videosFallback: 'assets/data/videos.json',
    postsEndpoint: '/wp-json/wp/v2/posts?per_page=30&_embed=wp:featuredmedia&_fields=date,title,link,excerpt,_links,_embedded',
    newsEndpoint: '/wp-json/jm/v1/news',
    postsFallback: 'assets/data/news.json',
    focal: 'assets/data/focal.json',
    press: 'assets/data/press.json',
    channels: {
      church:   { name: 'Cathedral of Praise Nashville', handle: '@CathedralofPraiseNashville', url: 'https://www.youtube.com/@CathedralofPraiseNashville' },
      personal: { name: 'Jerry L. Maynard, II', handle: '@jerrylmaynard', url: 'https://www.youtube.com/@jerrylmaynard' }
    }
  }, window.JM || {});

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thumb = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
  const ago = iso => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
    const d = Math.round(s / 86400);
    if (d < 14) return `${d} day${d > 1 ? 's' : ''} ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtDate = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const cleanTitle = t => t.replace(/\s*\|\s*Pastor Jerry Maynard II\s*/i, ' · ').replace(/·\s*\|/g, '·').replace(/\s{2,}/g, ' ').replace(/ · $/, '').trim();

  /* ---------- header / drawer ---------- */
  const hdr = $('.hdr');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const drawer = $('.drawer');
  $$('[data-menu]').forEach(b => b.addEventListener('click', () => {
    const open = !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }));

  /* ---------- reveal + count-up ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    if (e.target.dataset.count) countUp(e.target);
    io.unobserve(e.target);
  }), { threshold: .15, rootMargin: '0px 0px -40px 0px' });
  const watch = () => $$('.rv:not(.in),[data-count]:not(.done)').forEach(el => io.observe(el));
  function countUp(el) {
    el.classList.add('done');
    const end = parseFloat(el.dataset.count), dec = (el.dataset.count.split('.')[1] || '').length;
    const t0 = performance.now(), dur = 1600;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), v = end * (1 - Math.pow(1 - p, 4));
      el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- masthead: fit name to the row (never clipped) ---------- */
  const name = $('.name');
  const fitName = () => {
    if (!name) return;
    const cs = getComputedStyle(name.parentElement);
    const box = name.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const stacked = matchMedia('(max-width:900px)').matches;
    const lines = $$('.ln', name);
    const measure = () => stacked ? Math.max(...lines.map(l => l.scrollWidth)) : lines.reduce((a, l) => a + l.scrollWidth, 0) + parseFloat(getComputedStyle(name).columnGap || 0);
    let fs = 100; name.style.fontSize = fs + 'px';
    for (let k = 0; k < 4; k++) {
      const m = measure();
      if (!(m > 0) || !(box > 0)) { name.style.fontSize = ''; return; }
      fs = Math.min(600, fs * box / m); name.style.fontSize = (Math.floor(fs * 100) / 100) + 'px';
    }
    while (measure() > box && fs > 10) { fs -= 0.5; name.style.fontSize = fs + 'px'; }
  };
  void fitName; /* sizing is handled in CSS with container units (see .name in site.css) */

  /* ---------- Nashville clock ---------- */
  const clk = $$('[data-clock]');
  const tickClock = () => clk.forEach(c => c.textContent = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT');
  if (clk.length) { tickClock(); setInterval(tickClock, 15000); }

  /* ---------- triptych ---------- */
  const trip = $('[data-trip]');
  if (trip) {
    const P = $$('.panel', trip), DUR = 6500;
    let cur = P.findIndex(p => p.classList.contains('on')), timer;
    const loadVid = p => {
      const v = $('video', p); if (!v || v.dataset.state) return v;
      v.dataset.state = 'loading';
      fetch(v.dataset.src, { method: 'HEAD' }).then(r => {
        if (!r.ok) return;
        v.src = v.dataset.src;
        v.addEventListener('canplay', () => { v.classList.add('ready'); if (p.classList.contains('on')) v.play().catch(() => {}); }, { once: true });
        v.load();
      }).catch(() => {});
      return v;
    };
    const set = n => {
      cur = n;
      P.forEach((p, k) => {
        const on = k === n; p.classList.toggle('on', on);
        const bar = $('.bar i', p); if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
        const v = loadVid(p);
        if (v && v.classList.contains('ready')) on ? v.play().catch(() => {}) : v.pause();
      });
    };
    const auto = () => { clearInterval(timer); timer = setInterval(() => !trip.classList.contains('paused') && set((cur + 1) % P.length), DUR); };
    trip.style.setProperty('--dur', DUR + 'ms');
    P.forEach((p, k) => {
      p.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) { set(k); trip.classList.add('paused'); } });
      p.addEventListener('click', e => { if (e.target.closest('a')) return; if (k === cur) location.href = p.dataset.href; else { set(k); auto(); } });
      p.addEventListener('keydown', e => { if (e.key === 'Enter') location.href = p.dataset.href; });
    });
    trip.addEventListener('mouseleave', () => { trip.classList.remove('paused'); auto(); });
    set(cur < 0 ? 1 : cur); auto();
  }

  /* ---------- reel (section shows only once the cut exists) ---------- */
  const reel = $('[data-reel]');
  if (reel) {
    const v = $('video', reel);
    fetch(v.dataset.src, { method: 'HEAD' }).then(r => {
      if (!r.ok) return;
      reel.closest('section').hidden = false; v.poster = v.dataset.poster; watch();
      $('.reel-play', reel).addEventListener('click', () => {
        if (!v.src) v.src = v.dataset.src;
        v.controls = true; v.play(); reel.classList.add('playing');
      });
    }).catch(() => {});
  }

  /* ---------- video modal ---------- */
  const modal = $('.vmodal');
  const openVideo = id => {
    if (!modal) return window.open(`https://www.youtube.com/watch?v=${id}`, '_blank');
    $('.box', modal).insertAdjacentHTML('beforeend', `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video player"></iframe>`);
    modal.classList.add('open'); document.body.style.overflow = 'hidden';
  };
  const closeVideo = () => { if (!modal) return; modal.classList.remove('open'); $$('iframe', modal).forEach(f => f.remove()); document.body.style.overflow = ''; };
  if (modal) { modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.x')) closeVideo(); }); addEventListener('keydown', e => e.key === 'Escape' && closeVideo()); }
  document.addEventListener('click', e => { const v = e.target.closest('[data-vid]'); if (v && !v.closest('.hub')) { e.preventDefault(); openVideo(v.dataset.vid); } });

  /* ---------- data loaders ---------- */
  const getJSON = async url => { const r = await fetch(A(url), { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); };
  let videosP;
  const loadVideos = () => videosP ||= (async () => {
    let d;
    try { d = await getJSON(CFG.videosEndpoint); } catch { d = await getJSON(CFG.videosFallback); }
    const tag = (arr, ch) => (arr || []).map(v => ({ ...v, ch })).sort((a, b) => new Date(b.published) - new Date(a.published));
    const church = tag(d.church, 'church'), personal = tag(d.personal, 'personal');
    return { church, personal, all: [...church, ...personal].sort((a, b) => new Date(b.published) - new Date(a.published)) };
  })();

  const vcard = v => `<button class="vcard rv" data-vid="${esc(v.id)}">
      <div class="th"><img loading="lazy" src="${thumb(v.id, 'mqdefault')}" alt=""><span class="badge ${v.ch}">${v.ch === 'church' ? 'Cathedral of Praise' : 'Jerry L. Maynard II'}</span></div>
      <b>${esc(cleanTitle(v.title))}</b><small>${ago(v.published)}</small></button>`;

  async function renderVideos() {
    const needs = $('[data-latest],[data-hub],[data-vgrid]');
    if (!needs) return;
    let V; try { V = await loadVideos(); } catch { return; }

    $$('[data-latest]').forEach(el => {
      const v = V[el.dataset.latest || 'church'][0]; if (!v) return;
      el.dataset.vid = v.id;
      el.innerHTML = `<span class="th"><img src="${thumb(v.id, 'mqdefault')}" alt=""></span>
        <span><small>Latest message &middot; ${ago(v.published)}</small><b>${esc(cleanTitle(v.title))}</b></span>`;
    });

    $$('[data-vgrid]').forEach(el => {
      const key = el.dataset.vgrid, lim = +el.dataset.limit || 99;
      const draw = k => { el.innerHTML = V[k].slice(0, lim).map(vcard).join('') || '<p class="muted">New videos will appear here automatically.</p>'; watch(); };
      draw(key);
      const f = el.dataset.filter && $(el.dataset.filter);
      if (f) $$('button', f).forEach(b => b.addEventListener('click', () => { $$('button', f).forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.k); }));
    });

    $$('[data-hub]').forEach(hub => {
      const player = $('.player', hub), rail = $('.rail', hub);
      const tabs = $$('[data-tab]', hub.parentElement);
      const sub = $('[data-sub]', hub.parentElement);
      const setMain = v => {
        player.innerHTML = `<a class="poster" href="https://www.youtube.com/watch?v=${esc(v.id)}" data-play="${esc(v.id)}">
          <img src="${thumb(v.id, 'maxresdefault')}" onerror="this.src='${thumb(v.id)}'" alt="">
          <span class="play"><svg width="28" height="28" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#0A1230"/></svg></span>
          <span class="meta"><small>${v.ch === 'church' ? 'Cathedral of Praise' : 'Jerry L. Maynard II'} · ${ago(v.published)}</small><b>${esc(cleanTitle(v.title))}</b></span></a>`;
        $$('.rail-item', rail).forEach(r => r.classList.toggle('on', r.dataset.id === v.id));
      };
      const draw = k => {
        const list = V[k].slice(0, 10);
        rail.innerHTML = list.map(v => `<button class="rail-item" data-id="${esc(v.id)}"><span class="th"><img loading="lazy" src="${thumb(v.id, 'mqdefault')}" alt=""></span><span><b>${esc(cleanTitle(v.title))}</b><small>${ago(v.published)}</small></span></button>`).join('');
        $$('.rail-item', rail).forEach((b, n) => b.addEventListener('click', () => setMain(list[n])));
        if (list[0]) setMain(list[0]);
        if (sub) { sub.href = CFG.channels[k].url + '?sub_confirmation=1'; sub.querySelector('span').textContent = `Subscribe to ${CFG.channels[k].handle}`; }
      };
      player.addEventListener('click', e => { const p = e.target.closest('[data-play]'); if (!p) return; e.preventDefault();
        player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${p.dataset.play}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video player"></iframe>`; });
      tabs.forEach(t => t.addEventListener('click', () => { tabs.forEach(x => x.classList.toggle('on', x === t)); draw(t.dataset.tab); }));
      draw(tabs.find(t => t.classList.contains('on'))?.dataset.tab || 'church');
    });
    watch();
  }

  /* ---------- news ---------- */
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  async function loadNews() {
    let posts;
    try { posts = await getJSON(CFG.newsEndpoint); if (!Array.isArray(posts) || !posts.length) throw 0; } catch { posts = null; }
    if (!posts) try {
      const d = await getJSON(CFG.postsEndpoint);
      posts = d.map(p => ({ date: p.date.slice(0, 10), title: decode(p.title.rendered), link: p.link,
        img: p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '',
        excerpt: decode(p.excerpt.rendered.replace(/<[^>]+>/g, '')).replace('[…]', '…').trim() }));
    } catch { posts = await getJSON(CFG.postsFallback); }
    let press = []; try { press = await getJSON(CFG.press); } catch {}
    const seen = new Set(posts.map(n => n.title.toLowerCase()));
    return [...posts, ...press.filter(n => !seen.has(n.title.toLowerCase()))].sort((a, b) => b.date.localeCompare(a.date));
  }
  const topic = t => /cogic|bishop|church|faith|chapel/i.test(t) ? 'Faith' : /council|stadium|mayor|senate|political|campaign|metro|vote/i.test(t) ? 'Civic' : /business|workforce|job|entrepreneur|boss|develop|housing|pay/i.test(t) ? 'Business' : 'Community';
  async function renderNews() {
    const els = $$('[data-news]'); if (!els.length) return;
    let N; try { N = await loadNews(); } catch { return; }
    let F = {}; try { F = await getJSON(CFG.focal); } catch {}
    const fp = n => { const k = decodeURIComponent((n.img || '').split('/').pop()); return n.pos || F[k] || '50% 22%'; };
    els.forEach(el => {
      const lim = +el.dataset.limit || 99, mode = el.dataset.news;
      const list = N.slice(0, lim);
      if (mode === 'list') {
        el.innerHTML = list.map(n => `<a class="nrow rv" href="${esc(n.link)}"><span class="d">${fmtDate(n.date)}</span>
          <span><span class="mono" style="color:var(--gold)">${topic(n.title)}${n.source ? ' &middot; ' + esc(n.source) : ''}</span><h3>${esc(n.title)}</h3></span>
          ${n.img ? `<img loading="lazy" src="${esc(A(n.img))}" alt="" style="object-position:${fp(n)}">` : '<span></span>'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 17 17 7M9 7h8v8"/></svg></a>`).join('');
      } else {
        el.innerHTML = list.map((n, k) => `<a class="ncard rv rv-d${k % 3}" href="${esc(n.link)}"${n.source ? ' target="_blank" rel="noopener"' : ''}>
          <div class="th">${n.img ? `<img loading="lazy" src="${esc(A(n.img))}" alt="" style="object-position:${fp(n)}">` : ''}</div>
          <span class="k">${topic(n.title)} · ${fmtDate(n.date)}${n.source ? ' · ' + esc(n.source) : ''}</span><h3>${esc(n.title)}</h3><p>${esc(n.excerpt)}</p></a>`).join('');
      }
    });
    watch();
  }

  /* ---------- project filters ---------- */
  const pf = $('[data-pfilter]');
  if (pf) $$('button', pf).forEach(b => b.addEventListener('click', () => {
    $$('button', pf).forEach(x => x.classList.toggle('on', x === b));
    $$('.proj a').forEach(a => { a.style.display = (b.dataset.k === 'all' || a.dataset.cat === b.dataset.k) ? '' : 'none'; });
  }));

  /* ---------- contact form (mailto until WP form plugin is wired) ---------- */
  const form = $('form[data-mailto]');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const body = `Name: ${f.get('name')}\nEmail: ${f.get('email')}\nOrganization: ${f.get('org') || ''}\nInquiry: ${f.get('type')}\n\n${f.get('message')}`;
    location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(`${f.get('type')} inquiry from ${f.get('name')}`)}&body=${encodeURIComponent(body)}`;
  });

  $$('[data-year]').forEach(e => e.textContent = new Date().getFullYear());
  watch(); renderVideos(); renderNews();
})();
setTimeout(() => document.documentElement.classList.add("settled"), 3000);

/* anniversary phones: muted preview loops in view; tap for sound */
(() => {
  const io = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: .4 });
  document.querySelectorAll('[data-anniv]').forEach(s => {
    const v = s.querySelector('video'), b = s.querySelector('.snd'), fig = s.closest('.phone');
    io.observe(v);
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-anniv] video').forEach(o => { if (o !== v) { o.muted = true; o.closest('.phone').classList.remove('playing'); } });
      v.muted = false; v.currentTime = 0; v.controls = true; v.play(); fig.classList.add('playing');
    });
  });
})();

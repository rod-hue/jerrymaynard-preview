/* Instagram wall for @jerrylmaynardii.
   Source, in order:
   1) LIVE: window.JM_IG_FEED = Behold.so JSON feed URL (set once Jerry connects his Instagram; free, ~2 min).
      The wall then always shows his newest posts with no edits.
   2) SNAPSHOT: assets/data/ig.json (his latest posts, captured Nov 5 2026).
   Cards: rotating gradient border, cursor-tracked 3D tilt, caption reveal. */
(() => {
  const el = document.querySelector('[data-ig]'); if (!el) return;
  const handle = el.dataset.handle;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-5-5 5-1-1 5-5-5-4 2-2 5 1 4-4z"/></svg>';
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>';

  const fromBehold = d => (Array.isArray(d) ? d : d.posts || []).map(p => ({
    permalink: p.permalink, img: p.sizes?.large?.mediaUrl || p.sizes?.medium?.mediaUrl || p.thumbnailUrl || p.mediaUrl,
    caption: (p.prunedCaption || p.caption || '').split('\n')[0], reel: /VIDEO|REEL/i.test(p.mediaType || '') || p.isReel, pinned: false, pos: '50% 30%'
  }));

  const card = (p, i) => `<a class="ig-card${i === 0 ? ' big' : ''}" href="${esc(p.permalink)}" target="_blank" rel="noopener" style="--d:${i * 0.6}s">
      <span class="ig-frame"><img loading="lazy" src="${esc(p.img)}" alt="${esc(p.caption)}" style="object-position:${esc(p.pos || '50% 30%')}">
        <span class="ig-shine"></span>
        <span class="ig-tag">${p.reel ? PLAY + 'Reel' : p.pinned ? PIN + 'Pinned' : 'Post'}</span>
        <span class="ig-cap"><span>${esc(p.caption)}</span><em>View on Instagram ${ARROW}</em></span></span></a>`;

  const render = posts => {
    el.innerHTML = posts.slice(0, 7).map(card).join('');
    if (!matchMedia('(hover:hover)').matches) return;
    el.querySelectorAll('.ig-card').forEach(c => {
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`); c.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
        c.style.setProperty('--gx', `${(x + .5) * 100}%`); c.style.setProperty('--gy', `${(y + .5) * 100}%`);
      });
      c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
    });
  };

  const get = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw 0; return r.json(); };
  (async () => {
    if (window.JM_IG_FEED) { try { const p = fromBehold(await get(window.JM_IG_FEED)); if (p.length) return render(p); } catch {} }
    try { render((await get('assets/data/ig.json')).posts); } catch {}
  })();
})();

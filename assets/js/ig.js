/* Instagram feed for @jerrylmaynardii.
   LIVE MODE: set window.JM_IG_FEED (or IG_FEED below) to the Behold.so JSON feed URL once Jerry
   connects his Instagram there (free, ~2 min, done from his account). The grid then always shows
   his latest posts and updates itself; nothing else to change.
   UNTIL THEN: the official Instagram embeds of his recent reels render instead. */
(() => {
  const IG_FEED = window.JM_IG_FEED || '';            // e.g. 'https://feeds.behold.so/XXXXXXXXXXXX'
  const el = document.querySelector('[data-ig]'); if (!el) return;
  const handle = el.dataset.handle;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fallback = () => {
    if (document.querySelector('script[src*="instagram.com/embed.js"]')) return window.instgrm && window.instgrm.Embeds.process();
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.instagram.com/embed.js'; document.body.appendChild(s);
  };

  const live = async () => {
    const r = await fetch(IG_FEED, { cache: 'no-cache' }); if (!r.ok) throw 0;
    const d = await r.json();
    const posts = (Array.isArray(d) ? d : d.posts || []).slice(0, 8);
    if (!posts.length) throw 0;
    el.classList.add('is-live');
    el.innerHTML = posts.map(p => {
      const img = p.sizes?.medium?.mediaUrl || p.thumbnailUrl || p.mediaUrl;
      const vid = /VIDEO|REEL/i.test(p.mediaType || '') || p.isReel;
      const cap = p.prunedCaption || p.caption || '';
      return `<a class="ig-tile" href="${esc(p.permalink)}" target="_blank" rel="noopener">
        <img loading="lazy" src="${esc(img)}" alt="${esc(cap.slice(0, 120))}">
        ${vid ? '<span class="ig-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' : ''}
        <span class="ig-cap">${esc(cap.slice(0, 140))}${cap.length > 140 ? '…' : ''}</span></a>`;
    }).join('') + `<a class="ig-more" href="https://www.instagram.com/${esc(handle)}/" target="_blank" rel="noopener">See more on Instagram &rarr;</a>`;
  };

  // only build the embeds when the section is close to view (they are heavy)
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    (IG_FEED ? live() : Promise.reject()).catch(fallback);
  }, { rootMargin: '600px' });
  io.observe(el);
})();

/* Cathedral of Praise — self-updating live service block.
   States (all on Nashville time, no weekly edits needed):
   - LIVE      : during a scheduled service window, or whenever the WordPress live check
                 (/wp-json/jm/v1/live, from the jm-youtube-sync plugin) says the channel is live.
                 Plays the channel's current live stream on the page.
   - UPCOMING  : off-air. Shows the most recent service ("Last service") and a countdown
                 to the next one. Flips automatically when the countdown hits zero. */
(() => {
  const CFG = Object.assign({
    channel: 'UCKXISvlzoIzbYcnLwkoNUNw',
    channelUrl: 'https://www.youtube.com/@CathedralofPraiseNashville',
    tz: 'America/Chicago',
    // day: 0 = Sunday. Add a midweek service here once its time is confirmed.
    services: [{ day: 0, start: '10:00', end: '12:30', name: 'Sunday Service' }],
    earlyMin: 10,                       // open the live player this many minutes before start
    liveEndpoint: '/wp-json/jm/v1/live',
    videosEndpoint: '/wp-json/jm/v1/videos',
    videosFallback: 'assets/data/videos.json'
  }, window.JM_LIVE || {});

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const blocks = $$('[data-live]'), pill = $('[data-live-pill]'), hudL = $('.hud-l');
  if (!blocks.length && !pill) return;

  /* ---- time helpers (wall-clock in Nashville) ---- */
  const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: CFG.tz, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).map(p => [p.type, p.value]));
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Offset (ms) between real UTC and Nashville wall-clock-as-UTC, so we can build real instants.
  const tzOffset = d => { const p = parts(d); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime(); };
  const atWall = (y, mo, da, hh, mm) => { const guess = Date.UTC(y, mo, da, hh, mm); return new Date(guess - tzOffset(new Date(guess))); };
  const hm = s => s.split(':').map(Number);

  // Every occurrence (start/end instants) of each service from 7 days ago to 14 days ahead.
  function occurrences(now) {
    const p = parts(now), base = Date.UTC(+p.year, p.month - 1, +p.day), today = DOW[p.weekday], out = [];
    for (let k = -7; k <= 14; k++) {
      const dow = (today + k + 70) % 7, d = new Date(base + k * 864e5);
      CFG.services.filter(s => s.day === dow).forEach(s => {
        const [sh, sm] = hm(s.start), [eh, em] = hm(s.end);
        out.push({ ...s, from: atWall(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sh, sm), to: atWall(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), eh, em) });
      });
    }
    return out.sort((a, b) => a.from - b.from);
  }
  function schedule(now = new Date()) {
    const occ = occurrences(now);
    const current = occ.find(o => now >= new Date(o.from - CFG.earlyMin * 6e4) && now < o.to);
    const next = occ.find(o => o.from > now && o !== current);
    return { current, next };
  }
  const fmtWhen = d => d.toLocaleString('en-US', { timeZone: CFG.tz, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

  /* ---- data ---- */
  const getJSON = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw 0; return r.json(); };
  let lastService = null, liveApi = null;
  const loadLast = async () => {
    let d; try { d = await getJSON(CFG.videosEndpoint); } catch { try { d = await getJSON(CFG.videosFallback); } catch { return; } }
    const list = (d.church || []).slice().sort((a, b) => new Date(b.published) - new Date(a.published));
    lastService = list.find(v => /sunday/i.test(v.title)) || list.find(v => /service/i.test(v.title)) || list[0] || null;
  };
  const checkLive = async () => { try { liveApi = await getJSON(CFG.liveEndpoint); } catch { liveApi = null; } };

  /* ---- render ---- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = t => t.replace(/\s*\|\s*Pastor Jerry Maynard II\s*/i, ' · ').replace(/·\s*\|/g, '·').replace(/\s{2,}/g, ' ').trim();
  let mode = '', target = null;

  function calLink(o) {
    const z = d => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const q = new URLSearchParams({ action: 'TEMPLATE', text: 'Cathedral of Praise · Live Sunday Service', dates: `${z(o.from)}/${z(o.to)}`,
      details: `Watch live at https://jerrymaynard.com/#live or ${CFG.channelUrl}/live`, location: '4300 Clarksville Pike, Nashville, TN 37218', recur: 'RRULE:FREQ=WEEKLY' });
    return 'https://calendar.google.com/calendar/render?' + q;
  }

  function render() {
    const now = new Date(), { current, next } = schedule(now);
    const force = new URLSearchParams(location.search).get('live');   // ?live=on to preview the live state
    const apiLive = (liveApi && liveApi.live) || force === 'on';
    const isLive = !!(current || apiLive);
    const newMode = isLive ? 'live' : 'off';
    target = next;
    if (pill) pill.hidden = !isLive;
    if (hudL) hudL.innerHTML = isLive ? '<i class="pulse live-red"></i><a href="#live" style="color:#FF5A5A">LIVE NOW</a>' : '<i class="pulse"></i>Live feed';

    blocks.forEach(b => {
      b.classList.toggle('is-live', isLive);
      const cal = $('[data-live-cal]', b); if (cal && next) cal.href = calLink(next);
      const when = $('[data-next-when]', b); if (when && next) when.textContent = fmtWhen(next.from);
      if (newMode === b.dataset.mode && !(newMode === 'off' && lastService && !b.dataset.last)) return;
      b.dataset.mode = newMode;
      const stage = $('[data-live-stage]', b), badge = $('[data-live-badge] span', b), title = $('[data-live-title]', b), sub = $('[data-live-sub]', b);
      if (isLive) {
        const vid = liveApi && liveApi.live && liveApi.id;
        const src = vid ? `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&rel=0` : `https://www.youtube.com/embed/live_stream?channel=${CFG.channel}&autoplay=1&mute=1`;
        badge.textContent = 'Live now';
        title.innerHTML = 'We’re live <i class="it">right now.</i>';
        sub.textContent = `${(current && current.name) || 'Live service'} from Cathedral of Praise. Tap the player for sound.`;
        stage.innerHTML = `<div class="live-player"><iframe src="${src}" title="Cathedral of Praise live service" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
      } else {
        badge.textContent = 'Sunday Service · 10 AM CT';
        title.innerHTML = 'Worship with <i class="it">Cathedral of Praise.</i>';
        sub.textContent = 'Live every Sunday at 10:00 AM Central, right here and on YouTube. Missed it? The last service is below.';
        if (lastService) {
          b.dataset.last = '1';
          const v = lastService, ago = Math.round((now - new Date(v.published)) / 864e5);
          stage.innerHTML = `<button class="live-last" data-vid="${esc(v.id)}"><span class="lt"><img src="https://i.ytimg.com/vi/${esc(v.id)}/maxresdefault.jpg" onerror="this.src='https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg'" alt=""><span class="play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></span>
            <span class="lm"><small>Last service &middot; ${ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago'}</small><b>${esc(clean(v.title))}</b><em>Watch the full replay</em></span></button>`;
        } else stage.innerHTML = '';
      }
    });
    tick();
  }

  function tick() {
    const live = blocks.some(b => b.classList.contains('is-live'));
    blocks.forEach(b => {
      const wrap = $('[data-count-wrap]', b); if (!wrap) return;
      wrap.hidden = live || !target;
      if (live || !target) return;
      let s = Math.max(0, Math.floor((target.from - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
      const set = (k, v) => { const e = $(`[data-cd="${k}"]`, b); if (e) e.textContent = v; };
      set('d', d); set('h', String(h).padStart(2, '0')); set('m', String(m).padStart(2, '0')); set('s', String(s).padStart(2, '0'));
    });
  }

  (async () => {
    await Promise.all([loadLast(), checkLive()]);
    render();
    setInterval(tick, 1000);
    setInterval(render, 20000);                       // flips to/from LIVE on its own
    setInterval(async () => { await checkLive(); render(); }, 120000);
    setInterval(loadLast, 30 * 60000);
  })();
})();

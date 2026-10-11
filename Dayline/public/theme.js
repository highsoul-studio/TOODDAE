// 生きた DOM の色だけを補間し、クリックを遮らない。
(function () {
  const root = document.documentElement;
  let settings = {}, timer, scheduleTimer, override, brandEpoch = 0, brandAnimation = null;
  try { settings = JSON.parse(document.getElementById('boot')?.textContent || '{}') || {}; override = JSON.parse(localStorage.getItem('themeOverride') || 'null'); } catch {}
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minutes = (s) => { const m=/^(\d{2}):(\d{2})$/.exec(String(s??'')),value=m?Number(m[1])*60+Number(m[2]):NaN;return value>=0&&value<1440?value:NaN; };
  const scheduleKey = value => `${value.auto?.enabled?'1':'0'}|${value.auto?.sunrise??''}|${value.auto?.sunset??''}`;
  function boundary(now=new Date()) { const values=[settings.auto?.sunrise,settings.auto?.sunset].map(minutes).filter(Number.isFinite);if(!values.length)return Date.now()+60000;return Math.min(...values.map(v=>{const d=new Date(now);d.setHours(Math.floor(v/60),v%60,0,0);if(d<=now)d.setDate(d.getDate()+1);return +d;})); }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function fadeBrand(brand, epoch, duration, startOpacity) {
    const fade = Math.min(180, duration);
    if (startOpacity > 0) { brandAnimation = brand.animate([{ opacity: startOpacity }, { opacity: 0 }], { duration: fade * startOpacity, easing: 'ease', fill: 'forwards' }); await brandAnimation.finished.catch(() => {}); }
    await wait(Math.max(0, duration - fade * startOpacity));
    if (epoch !== brandEpoch) return;
    brand.style.opacity = '0'; brandAnimation?.cancel(); brand.style.color = getComputedStyle(root).getPropertyValue('--accent-icon').trim();
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (epoch !== brandEpoch) return;
    brandAnimation = brand.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease', fill: 'forwards' }); await brandAnimation.finished.catch(() => {});
    if (epoch !== brandEpoch) return;
    brand.style.opacity = '1'; brandAnimation.cancel(); brandAnimation = null; brand.style.removeProperty('opacity'); brand.style.removeProperty('color');
  }
  function apply(mode, ms=0) {
    const palette=settings.appearance?.[mode],bg=palette?.background||(mode==='dark'?'black':'white'),accent=palette?.accent||(mode==='dark'?'violet':'amber'),noMotion=reduced(),unchanged=mode===root.dataset.theme&&bg===root.dataset.bg&&accent===root.dataset.accent;
    if(unchanged){if(noMotion){brandEpoch++;brandAnimation?.cancel();brandAnimation=null;const brand=document.querySelector('.brand svg');brand?.style.removeProperty('opacity');brand?.style.removeProperty('color');clearTimeout(timer);root.style.removeProperty('--theme-ms');}return;}
    const duration=noMotion?0:ms,brandDuration=noMotion||mode===root.dataset.theme&&accent===root.dataset.accent?0:ms,brand=document.querySelector('.brand svg'),epoch=++brandEpoch;
    dispatchEvent(new CustomEvent('tooddae-theme-changing',{detail:{duration}}));
    if(brand){const style=getComputedStyle(brand),opacity=Math.max(0,Math.min(1,Number(style.opacity)||0)),color=style.color;brand.style.opacity=String(opacity);brand.style.color=color;brandAnimation?.cancel();brandAnimation=null;if(!brandDuration){brand.style.removeProperty('opacity');brand.style.removeProperty('color');}else fadeBrand(brand,epoch,brandDuration,opacity);}
    clearTimeout(timer);root.style.setProperty('--theme-ms',`${duration}ms`);root.dataset.theme=mode;root.dataset.bg=bg;root.dataset.accent=accent;root.style.colorScheme=mode;
    timer=setTimeout(()=>{root.style.removeProperty('--theme-ms');const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=getComputedStyle(root).getPropertyValue('--n-1').trim();dispatchEvent(new Event('tooddae-theme-changed'));},duration);
  }
  function tick(ms=2400,now=new Date()) { if(!settings.auto?.enabled)return;if(override?.until>Date.now())return;override=null;saveOverride();const m=now.getHours()*60+now.getMinutes(),rise=minutes(settings.auto.sunrise),set=minutes(settings.auto.sunset);if(!Number.isFinite(rise)||!Number.isFinite(set)||rise===set)return;const light=rise<set?m>=rise&&m<set:m>=rise||m<set,mode=light?'light':'dark';if(mode!==root.dataset.theme)apply(mode,ms); }
  function schedule(){clearTimeout(scheduleTimer);const delay=60000-Date.now()%60000+40;scheduleTimer=setTimeout(()=>{tick();schedule();},delay);}
  function saveOverride(){try{override?localStorage.setItem('themeOverride',JSON.stringify(override)):localStorage.removeItem('themeOverride');}catch{}}
  if(override&&(!override.schedule||override.schedule!==scheduleKey(settings))){override=null;saveOverride();}
  let saved='dark';try{saved=localStorage.getItem('theme')==='light'?'light':'dark';}catch{}
  apply(override?.until>Date.now()?override.mode:saved);tick(0);schedule();
  window.dayTheme={get:()=>root.dataset.theme,toggle(after){const mode=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('theme',mode);}catch{}if(settings.auto?.enabled){override={mode,until:boundary(),schedule:scheduleKey(settings)};saveOverride();}apply(mode,450);after?.(mode);},configure(s){const next=s.settings||s,changed=scheduleKey(next)!==scheduleKey(settings);settings=next;if(!settings.auto?.enabled||changed){override=null;saveOverride();}apply(root.dataset.theme,450);tick(450);schedule();},tick};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();schedule();}});addEventListener('hashchange',()=>tick());
})();

import React, { useEffect, useRef, useState } from 'react';

// plays once each time the app is opened (a page load), on phone and desktop
let played = false;

/**
 * Opening animation, same idea as a mask reveal: logo, then the name, the name shrinks to a dot,
 * the dot drops, jumps to the top and a growing circle opens the app underneath.
 */
export const Splash: React.FC = () => {
  const [on, setOn] = useState(() => !played);
  const hole = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => { played = true; setOn(false); }, 3500);
    // the circle that opens the app is drawn by script, so it works on every phone and browser
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const R = Math.hypot(window.innerWidth, window.innerHeight) * 1.05;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, ((now - t0) / 1000 - 2.65) / 0.75));
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      hole.current?.setAttribute('r', String(e * R));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [on]);

  if (!on) return null;
  return (
    <div className="zs" aria-hidden="true">
      <svg className="zs-bg" width="100%" height="100%">
        <defs><mask id="zs-m"><rect width="100%" height="100%" fill="#fff" /><circle ref={hole} cx="50%" cy="13%" r="0" fill="#000" /></mask></defs>
        <rect width="100%" height="100%" fill="#22C55E" mask="url(#zs-m)" />
      </svg>
      <img src="/zaylow-logo.png" alt="" className="zs-logo" />
      <span className="zs-word">ZAYLOW</span>
      <i className="zs-dot" />
      <style>{`
        .zs{position:fixed;inset:0;z-index:100;overflow:hidden;pointer-events:none}
        .zs-bg{position:absolute;inset:0;display:block}
        .zs-logo{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;object-fit:contain;
          animation:zs-logo-in .6s cubic-bezier(.22,1,.36,1) both,zs-logo-out .3s cubic-bezier(.5,0,.75,0) .95s forwards}
        .zs-word{position:absolute;left:50%;top:50%;font:800 clamp(30px,8vw,46px)/1 'DM Sans',system-ui,sans-serif;color:#0a0a0a;white-space:nowrap;
          transform:translate(-50%,-50%);opacity:0;animation:zs-word-in .45s cubic-bezier(.22,1,.36,1) 1.2s both,zs-word-out .26s cubic-bezier(.6,0,.9,.4) 1.85s forwards}
        .zs-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#0a0a0a;opacity:0;
          animation:zs-dot-in .15s ease 2.05s both,zs-dot-go .5s cubic-bezier(.65,0,.35,1) 2.2s forwards,zs-dot-out .12s ease 2.7s forwards}
        @keyframes zs-logo-in{from{opacity:0;transform:scale(.55) rotate(-90deg)}to{opacity:1;transform:none}}
        @keyframes zs-logo-out{to{opacity:0;transform:scale(.4)}}
        @keyframes zs-word-in{from{opacity:0;letter-spacing:.5em;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;letter-spacing:.1em;transform:translate(-50%,-50%)}}
        @keyframes zs-word-out{to{opacity:0;letter-spacing:-.05em;transform:translate(-50%,-50%) scale(.04)}}
        @keyframes zs-dot-in{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}
        @keyframes zs-dot-go{0%{transform:translateY(0)}25%{transform:translateY(14px)}100%{transform:translateY(-37vh)}}
        @keyframes zs-dot-out{to{opacity:0}}
        @media (prefers-reduced-motion: reduce){
          .zs{animation:zs-fade .5s ease 1.2s forwards}
          .zs-logo{animation:zs-fadein .4s ease both}.zs-word,.zs-dot{display:none}
          @keyframes zs-fade{to{opacity:0}}@keyframes zs-fadein{from{opacity:0}to{opacity:1}}
        }
      `}</style>
    </div>
  );
};

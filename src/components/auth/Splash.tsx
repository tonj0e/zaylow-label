import React, { useEffect, useState } from 'react';

// plays once each time the app is opened (a page load), on phone and desktop
let played = false;

/**
 * Opening animation, same idea as a mask reveal: logo, then the name, the name shrinks to a dot,
 * the dot drops, jumps to the top and a growing circle opens the app underneath.
 */
export const Splash: React.FC = () => {
  const [on, setOn] = useState(() => !played);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => { played = true; setOn(false); }, 3500);
    return () => clearTimeout(t);
  }, [on]);

  if (!on) return null;
  return (
    <div className="zs" aria-hidden="true">
      <img src="/zaylow-logo.png" alt="" className="zs-logo" />
      <span className="zs-word">ZAYLOW</span>
      <i className="zs-dot" />
      <style>{`
        @property --zs-r{syntax:'<length>';inherits:false;initial-value:0px}
        .zs{position:fixed;inset:0;z-index:100;background:#22C55E;overflow:hidden;pointer-events:none;
          -webkit-mask-image:radial-gradient(circle at 50% 13%,transparent var(--zs-r),#000 calc(var(--zs-r) + 1px));
          mask-image:radial-gradient(circle at 50% 13%,transparent var(--zs-r),#000 calc(var(--zs-r) + 1px));
          animation:zs-open .75s cubic-bezier(.65,0,.35,1) 2.65s both,zs-end .15s linear 3.3s forwards}
        .zs-logo{position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;object-fit:contain;
          animation:zs-logo-in .6s cubic-bezier(.22,1,.36,1) both,zs-logo-out .3s cubic-bezier(.5,0,.75,0) .95s forwards}
        .zs-word{position:absolute;left:50%;top:50%;font:800 clamp(30px,8vw,46px)/1 'DM Sans',system-ui,sans-serif;color:#0a0a0a;white-space:nowrap;
          transform:translate(-50%,-50%);opacity:0;animation:zs-word-in .45s cubic-bezier(.22,1,.36,1) 1.2s both,zs-word-out .26s cubic-bezier(.6,0,.9,.4) 1.85s forwards}
        .zs-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#0a0a0a;opacity:0;
          animation:zs-dot-in .15s ease 2.05s both,zs-dot-go .5s cubic-bezier(.65,0,.35,1) 2.2s forwards}
        @keyframes zs-logo-in{from{opacity:0;transform:scale(.55) rotate(-90deg)}to{opacity:1;transform:none}}
        @keyframes zs-logo-out{to{opacity:0;transform:scale(.4)}}
        @keyframes zs-word-in{from{opacity:0;letter-spacing:.5em;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;letter-spacing:.1em;transform:translate(-50%,-50%)}}
        @keyframes zs-word-out{to{opacity:0;letter-spacing:-.05em;transform:translate(-50%,-50%) scale(.04)}}
        @keyframes zs-dot-in{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}
        @keyframes zs-dot-go{0%{transform:translateY(0)}25%{transform:translateY(14px)}100%{transform:translateY(-37vh)}}
        @keyframes zs-end{to{opacity:0}}
        @keyframes zs-open{from{--zs-r:0px}to{--zs-r:170vmax}}
        @media (prefers-reduced-motion: reduce){
          .zs{-webkit-mask-image:none;mask-image:none;animation:zs-fade .5s ease 1.2s forwards}
          .zs-logo{animation:zs-fadein .4s ease both}.zs-word,.zs-dot{display:none}
          @keyframes zs-fade{to{opacity:0}}@keyframes zs-fadein{from{opacity:0}to{opacity:1}}
        }
      `}</style>
    </div>
  );
};

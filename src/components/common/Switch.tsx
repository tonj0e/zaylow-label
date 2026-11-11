import React from 'react';

/** On/off switch: green track when on, with the knob always inside the track. */
export const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative w-12 h-7 rounded-full shrink-0 transition-colors" style={{ background: on ? 'var(--lime)' : 'var(--line)' }}>
    <span className="absolute top-1 left-1 w-5 h-5 rounded-full transition-transform" style={{ background: on ? 'var(--on-lime)' : 'var(--muted)', transform: on ? 'translateX(20px)' : 'none' }} />
  </button>
);

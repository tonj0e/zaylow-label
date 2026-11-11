import React from 'react';

/** Placeholder shown while a page waits for its first data, so zeros are never shown as real numbers. */
export const PageSkeleton: React.FC<{ title: string }> = ({ title }) => (
  <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-24 md:pb-6" aria-busy="true" aria-label={`Loading ${title}`}>
    <div><h2 className="text-2xl font-bold k-display">{title}</h2><p className="text-sm k-muted mt-1">Loading…</p></div>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="k-skel h-32 rounded-3xl animate-pulse" />)}</div>
    <div className="k-card p-4 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="k-skel h-14 rounded-2xl animate-pulse" />)}</div>
  </div>
);

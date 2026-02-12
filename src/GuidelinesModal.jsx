import React from 'react';
import guidelinesHtmlAsset from '../updates/Dataset labelling guidelines.html?raw';
const guidelinesPdfUrl = new URL('../updates/Dataset labelling guidelines.pdf', import.meta.url).href;

export default function GuidelinesModal({ show, onClose, guidelinesTheme, setGuidelinesTheme }) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dataset Labelling Guidelines</h3>
          <div className="modal-header-controls">
            <button
              className="btn-ghost"
              onClick={() => setGuidelinesTheme(guidelinesTheme === 'dark' ? 'light' : 'dark')}
              title="Toggle reading background"
            >
              {guidelinesTheme === 'dark' ? 'Light background' : 'Dark background'}
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          <iframe
            className="guidelines-frame"
            title="Guidelines"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${
              guidelinesTheme === 'dark'
                ? 'body{background:#0f172a !important;color:#e5e7eb !important;} h1,h2,h3,h4,h5,h6{color:#f1f5f9 !important;} a{color:#93c5fd !important;} table,td,th{border-color:#334155 !important;}'
                : 'body{background:#f8fafc !important;color:#1f2937 !important;} h1,h2,h3,h4,h5,h6{color:#111827 !important;} a{color:#2563eb !important;} table,td,th{border-color:#d1d5db !important;}'
            }</style></head><body>${guidelinesHtmlAsset}</body></html>`}
          />
        </div>
        <div className="modal-footer">
          <a href={guidelinesPdfUrl} target="_blank" rel="noreferrer" className="text-btn">Open in new tab</a>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

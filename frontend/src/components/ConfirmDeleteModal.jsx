import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function ConfirmDeleteModal({
  isOpen,
  title = "Confirm Permanent Deletion",
  message = "Are you sure you want to delete this operational note? This action cannot be undone.",
  itemDetails = null,
  confirmText = "Yes, Delete Note",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDeleting = false
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl shadow-rose-950/40 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full bg-slate-800/60 hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Warning Icon Badge */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 shadow-inner">
            <AlertTriangle className="w-6 h-6 text-rose-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white tracking-wide">{title}</h3>
            <p className="text-xs text-rose-400/90 font-medium">Irreversible Field Action</p>
          </div>
        </div>

        {/* Message */}
        <p className="text-xs text-slate-300 leading-relaxed">
          {message}
        </p>

        {/* Item Details Box */}
        {itemDetails && (
          <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1.5">
            {itemDetails.siteId && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Target Site:</span>
                <span className="font-mono font-extrabold text-cyan-300">{itemDetails.siteId}</span>
              </div>
            )}
            {itemDetails.itemTitle && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Note Title:</span>
                <span className="font-semibold text-white truncate max-w-[220px]">{itemDetails.itemTitle}</span>
              </div>
            )}
            {itemDetails.author && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Author:</span>
                <span className="text-slate-300">{itemDetails.author}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-rose-950/50 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Deleting...' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

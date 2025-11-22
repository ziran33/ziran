
import React, { useState, useEffect } from 'react';
import { Button } from './Button';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (name: string, notes: string) => void;
  suggestedName: string;
}

export const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  onCommit,
  suggestedName
}) => {
  const [name, setName] = useState(suggestedName);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(suggestedName);
      setNotes('');
    }
  }, [isOpen, suggestedName]);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md ring-1 ring-white/10 overflow-hidden flex flex-col">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                </div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">提交变更 (Commit Changes)</h2>
            </div>
            
            <div className="p-6 space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">版本号 (Version Tag)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm font-mono">v</span>
                        <input 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-6 pr-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                            value={name.replace(/^v/, '')}
                            onChange={e => setName(`v${e.target.value}`)}
                            placeholder="1.0.0"
                            autoFocus
                        />
                    </div>
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">变更描述 (Commit Message)</label>
                    <textarea 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none h-32 custom-scrollbar leading-relaxed placeholder-slate-600"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="描述本次迭代的主要变更点..."
                    />
                </div>
            </div>

            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
                <Button variant="secondary" onClick={onClose}>取消</Button>
                <Button onClick={() => onCommit(name, notes)} disabled={!name.trim()}>确认提交</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

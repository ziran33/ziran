
import React from 'react';
import { PromptVersion } from '../types';
import { Button } from './Button';

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  oldVersion: PromptVersion | null;
  newVersion: PromptVersion | null;
}

export const DiffModal: React.FC<DiffModalProps> = ({
  isOpen,
  onClose,
  oldVersion,
  newVersion
}) => {
  if (!isOpen || !newVersion) return null;

  const displayOldConfig = oldVersion ? `${oldVersion.model} (T:${oldVersion.config.temperature})` : 'N/A';
  const displayNewConfig = `${newVersion.model} (T:${newVersion.config.temperature})`;

  // Compare System Instructions
  const oldSystem = oldVersion?.systemInstruction || '';
  const newSystem = newVersion.systemInstruction || '';
  const isSystemChanged = oldSystem !== newSystem;

  // Compare User Prompt
  const oldContent = oldVersion?.content || '';
  const newContent = newVersion.content;
  const isContentChanged = oldContent !== newContent;

  // Compare Config
  const isConfigChanged = oldVersion 
    ? (oldVersion.model !== newVersion.model || oldVersion.config.temperature !== newVersion.config.temperature)
    : true;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col ring-1 ring-white/10">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
             </div>
             <div>
                <h2 className="text-lg font-bold text-white">版本变更对比 (Version Diff)</h2>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{oldVersion?.name || 'Base'}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    <span className="px-2 py-0.5 rounded bg-indigo-900/30 border border-indigo-500/30 text-indigo-300">{newVersion.name}</span>
                </div>
             </div>
          </div>
          <Button onClick={onClose} variant="secondary">关闭</Button>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            
            {/* 1. Configuration Diff */}
            <div className={`rounded-xl border ${isConfigChanged ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-slate-800 bg-slate-900/50'} overflow-hidden`}>
               <div className="px-4 py-2 border-b border-slate-800/50 flex justify-between items-center bg-black/20">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">配置参数 (Configuration)</h3>
                  {isConfigChanged && <span className="text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">CHANGED</span>}
               </div>
               <div className="grid grid-cols-2 divide-x divide-slate-800/50">
                   <div className="p-4">
                      <div className="text-[10px] text-slate-500 mb-1">PREVIOUS</div>
                      <div className="font-mono text-sm text-slate-400">{displayOldConfig}</div>
                   </div>
                   <div className="p-4">
                      <div className="text-[10px] text-slate-500 mb-1">CURRENT</div>
                      <div className={`font-mono text-sm ${isConfigChanged ? 'text-yellow-300' : 'text-slate-400'}`}>{displayNewConfig}</div>
                   </div>
               </div>
            </div>

            {/* 2. System Instruction Diff */}
            <div className={`rounded-xl border ${isSystemChanged ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/50'} overflow-hidden flex flex-col h-64`}>
               <div className="px-4 py-2 border-b border-slate-800/50 flex justify-between items-center bg-black/20 flex-shrink-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">系统指令 (System Instructions)</h3>
                  {isSystemChanged && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-bold">MODIFIED</span>}
               </div>
               <div className="grid grid-cols-2 divide-x divide-slate-800/50 flex-1 min-h-0">
                   <div className="p-0 flex flex-col">
                       <textarea 
                          readOnly 
                          className="flex-1 w-full p-4 bg-transparent resize-none outline-none text-xs font-mono text-slate-400 leading-relaxed custom-scrollbar"
                          value={oldSystem}
                       />
                   </div>
                   <div className="p-0 flex flex-col">
                       <textarea 
                          readOnly 
                          className={`flex-1 w-full p-4 bg-transparent resize-none outline-none text-xs font-mono leading-relaxed custom-scrollbar ${isSystemChanged ? 'text-indigo-200 bg-indigo-500/5' : 'text-slate-400'}`}
                          value={newSystem}
                       />
                   </div>
               </div>
            </div>

            {/* 3. User Prompt Diff */}
             <div className={`rounded-xl border ${isContentChanged ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/50'} overflow-hidden flex flex-col flex-1 min-h-[300px]`}>
               <div className="px-4 py-2 border-b border-slate-800/50 flex justify-between items-center bg-black/20 flex-shrink-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">用户提示词 (User Prompt)</h3>
                  {isContentChanged && <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold">MODIFIED</span>}
               </div>
               <div className="grid grid-cols-2 divide-x divide-slate-800/50 flex-1 min-h-0">
                   <div className="p-0 flex flex-col">
                       <textarea 
                          readOnly 
                          className="flex-1 w-full p-4 bg-transparent resize-none outline-none text-sm font-mono text-slate-400 leading-relaxed custom-scrollbar"
                          value={oldContent}
                       />
                   </div>
                   <div className="p-0 flex flex-col">
                       <textarea 
                          readOnly 
                          className={`flex-1 w-full p-4 bg-transparent resize-none outline-none text-sm font-mono leading-relaxed custom-scrollbar ${isContentChanged ? 'text-emerald-200 bg-emerald-500/5' : 'text-slate-400'}`}
                          value={newContent}
                       />
                   </div>
               </div>
            </div>

        </div>
      </div>
    </div>
  );
};

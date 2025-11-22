
import React from 'react';
import { PromptVersion } from '../types';

interface VersionListProps {
  versions: PromptVersion[];
  activeVersionId: string;
  onSelect: (version: PromptVersion) => void;
  onDelete: (id: string) => void;
}

export const VersionList: React.FC<VersionListProps> = ({
  versions,
  activeVersionId,
  onSelect,
  onDelete,
}) => {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">历史版本</h3>
      <div className="flex-1 overflow-y-auto space-y-1 pr-2">
        {versions.slice().reverse().map((version) => (
          <div
            key={version.id}
            className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
              version.id === activeVersionId
                ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-200'
                : 'bg-slate-800/40 border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            onClick={() => onSelect(version)}
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                 <span className={`font-medium text-sm truncate ${version.id === activeVersionId ? 'text-indigo-100' : ''}`}>
                   {version.name}
                 </span>
              </div>
              <span className="text-xs opacity-60 truncate">
                {new Date(version.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
            
            {versions.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(version.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-opacity"
                title="删除版本"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
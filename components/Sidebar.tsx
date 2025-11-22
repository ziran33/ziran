



import React, { useState, useMemo } from 'react';
import { PromptProject, PromptVersion, User, LLMConfig } from '../types';
import { Button } from './Button';

interface SidebarProps {
  projects: PromptProject[];
  activeProjectId: string;
  versions: PromptVersion[];
  activeVersionId: string;
  user: User | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, tags: string[]) => void;
  onUpdateProject: (id: string, updates: Partial<PromptProject>) => void;
  onDeleteProject: (id: string) => void;
  onSelectVersion: (version: PromptVersion) => void;
  onDeleteVersion: (id: string) => void;
  onCompareVersion: (current: PromptVersion, previous: PromptVersion) => void;
  onForkVersion: (version: PromptVersion) => void;
  onLogout: () => void;
  availableAPIs: LLMConfig[]; // Added prop
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProjectId,
  versions,
  activeVersionId,
  user,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSelectVersion,
  onDeleteVersion,
  onCompareVersion,
  onForkVersion,
  onLogout,
  availableAPIs
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  
  // Project Settings Modal State
  const [editingProject, setEditingProject] = useState<PromptProject | null>(null);
  const [editName, setEditName] = useState('');
  const [editTagInput, setEditTagInput] = useState('');

  // User Profile Modal State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach(p => p.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!selectedTagFilter) return projects;
    return projects.filter(p => p.tags.includes(selectedTagFilter));
  }, [projects, selectedTagFilter]);

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      const tagsArray = newTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
      onCreateProject(newName.trim(), tagsArray);
      setNewName('');
      setNewTags('');
      setIsCreating(false);
    }
  };

  const addQuickTag = (tag: string) => {
      if (!newTags.includes(tag)) {
          setNewTags(prev => prev ? `${prev}, ${tag}` : tag);
      }
  };

  const openProjectSettings = (e: React.MouseEvent, project: PromptProject) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditName(project.name);
    setEditTagInput('');
  };

  const handleSaveProjectSettings = () => {
    if (!editingProject) return;
    onUpdateProject(editingProject.id, { name: editName });
    setEditingProject(null);
  };

  const handleAddTagToProject = () => {
    if (!editingProject || !editTagInput.trim()) return;
    if (!editingProject.tags.includes(editTagInput.trim())) {
       onUpdateProject(editingProject.id, { tags: [...editingProject.tags, editTagInput.trim()] });
    }
    setEditTagInput('');
  };

  const handleRemoveTagFromProject = (tagToRemove: string) => {
    if (!editingProject) return;
    onUpdateProject(editingProject.id, { tags: editingProject.tags.filter(t => t !== tagToRemove) });
  };

  const handleDeleteProject = () => {
    if (!editingProject) return;
    if (window.confirm(`确定要删除项目 "${editingProject.name}" 吗？所有历史版本将永久丢失。`)) {
        onDeleteProject(editingProject.id);
        setEditingProject(null);
    }
  };

  const handleChangePassword = () => {
      if (!pwdOld || !pwdNew) {
          setPwdMsg('Error: Fields cannot be empty');
          return;
      }
      // Mock Change
      setTimeout(() => {
          setPwdMsg('Success: Password updated (Mock)');
          setPwdOld('');
          setPwdNew('');
      }, 500);
  };

  // Helper to get real model name
  const getModelName = (modelId: string) => {
      const config = availableAPIs.find(a => a.id === modelId);
      return config ? config.name : modelId;
  };

  // Helper to calculate comprehensive version stats
  const getVersionStats = (index: number) => {
    const current = versions[index];
    const previous = index < versions.length - 1 ? versions[index + 1] : null;
    
    let currentLen = 0;
    if (current.type === 'chat' && current.messages) {
        currentLen = current.messages.reduce((acc, m) => acc + m.content.length, 0) + (current.systemInstruction || '').length;
    } else {
        currentLen = current.content.length + (current.systemInstruction || '').length;
    }

    let prevLen = 0;
    if (previous) {
        if (previous.type === 'chat' && previous.messages) {
            prevLen = previous.messages.reduce((acc, m) => acc + m.content.length, 0) + (previous.systemInstruction || '').length;
        } else {
            prevLen = previous.content.length + (previous.systemInstruction || '').length;
        }
    }
    
    const charDiff = previous ? currentLen - prevLen : 0;
    
    // Find parent name if it exists (for lineage display)
    let parentName = '';
    if (current.parentId) {
        const parent = versions.find(v => v.id === current.parentId);
        if (parent) parentName = parent.name;
    }

    return { charCount: currentLen, charDiff, previous, parentName };
  };

  const getTypeIcon = (type?: string) => {
     switch(type) {
         case 'chat': return <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>;
         case 'workflow': return <svg className="w-3 h-3 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>;
         default: return <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
     }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 border-r border-slate-800 select-none font-sans">
      
      {/* COLUMN 1: Project Rail */}
      <div className="w-[72px] flex-shrink-0 flex flex-col items-center py-4 border-r border-slate-800 bg-slate-950 z-20">
        {/* Brand Icon */}
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900/20 mb-6 group relative cursor-default">
           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-4 w-full px-2 flex flex-col items-center flex-1 overflow-y-auto custom-scrollbar">
           <button onClick={() => setSelectedTagFilter(null)} className={`w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all duration-200 ${!selectedTagFilter ? 'bg-slate-800 text-white ring-1 ring-slate-600' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>ALL</button>
           {allTags.map(tag => (
             <button key={tag} onClick={() => setSelectedTagFilter(tag)} className={`w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all duration-200 border ${selectedTagFilter === tag ? 'border-indigo-500 text-indigo-400 bg-indigo-900/20 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>{tag.slice(0,2).toUpperCase()}</button>
           ))}
        </div>
        
        <button onClick={() => setIsCreating(true)} className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-200 border border-slate-700 hover:border-indigo-500 mb-4"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>

        {/* User Profile Trigger */}
        <div className="mt-auto pb-4 w-full px-2 flex flex-col items-center gap-3 border-t border-slate-800 pt-4">
           <div onClick={() => setIsProfileOpen(true)} className="relative group cursor-pointer">
               <img src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'guest'}`} alt="User" className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors"/>
           </div>
           <button onClick={onLogout} className="w-10 h-10 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/10 flex items-center justify-center transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg></button>
        </div>
      </div>

      {/* COLUMN 2: Detailed Lists */}
      <div className="w-[300px] flex flex-col min-w-0 bg-slate-900 relative border-r border-slate-800">
        
        {/* New Project Form Overlay */}
        {isCreating && (
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-30 p-4 flex flex-col animate-fadeIn">
            <h3 className="text-sm font-bold text-white mb-4">新建项目</h3>
            <form onSubmit={handleSubmitCreate} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">项目名称</label>
                <input autoFocus className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" value={newName} onChange={e => setNewName(e.target.value)} placeholder="我的新 Prompt" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">标签 (可选)</label>
                <input className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="翻译, 写作, Code" />
                
                {allTags.length > 0 && (
                    <div className="mt-2">
                        <span className="text-[9px] text-slate-500 block mb-1">快速选择:</span>
                        <div className="flex flex-wrap gap-1">
                            {allTags.slice(0, 8).map(t => (
                                <button type="button" key={t} onClick={() => addQuickTag(t)} className="px-1.5 py-0.5 bg-slate-800 text-[9px] text-slate-400 rounded hover:text-white border border-slate-700">{t}</button>
                            ))}
                        </div>
                    </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                 <button type="button" onClick={() => setIsCreating(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded border border-slate-700">取消</button>
                 <button type="submit" className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-500 shadow-lg shadow-indigo-900/20">创建</button>
              </div>
            </form>
          </div>
        )}

        {/* User Profile Modal */}
        {isProfileOpen && (
            <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-40 p-4 flex flex-col animate-fadeIn">
                <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-white">用户概览</h3>
                    <button onClick={() => setIsProfileOpen(false)} className="text-slate-500 hover:text-white">✕</button>
                </div>
                
                <div className="flex flex-col items-center mb-6">
                    <img src={user?.avatar} className="w-20 h-20 rounded-full border-2 border-slate-700 mb-3"/>
                    <h2 className="text-lg font-bold text-white">{user?.username}</h2>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                </div>

                <div className="space-y-4 border-t border-slate-800 pt-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">修改密码</h4>
                    <input type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} placeholder="当前密码" className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"/>
                    <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} placeholder="新密码" className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"/>
                    
                    {pwdMsg && <div className={`text-[10px] ${pwdMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{pwdMsg}</div>}
                    
                    <Button size="sm" onClick={handleChangePassword} className="w-full">更新密码</Button>
                </div>
            </div>
        )}

        {/* Project Settings Modal Overlay */}
        {editingProject && (
           <div className="absolute inset-0 bg-slate-900 z-40 p-4 flex flex-col animate-fadeIn">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      项目设置
                  </h3>
                  <button onClick={() => setEditingProject(null)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar">
                  <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">重命名项目</label>
                      <input className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" value={editName} onChange={e => setEditName(e.target.value)}/>
                  </div>
                  <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">标签管理</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                          {editingProject.tags.map(tag => (
                              <span key={tag} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded-md border border-slate-700 flex items-center gap-1">
                                  {tag}
                                  <button onClick={() => handleRemoveTagFromProject(tag)} className="hover:text-red-400">×</button>
                              </span>
                          ))}
                      </div>
                      <div className="flex gap-2">
                          <input className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none" value={editTagInput} onChange={e => setEditTagInput(e.target.value)} placeholder="输入新标签" onKeyDown={e => e.key === 'Enter' && handleAddTagToProject()}/>
                          <button onClick={handleAddTagToProject} className="text-[10px] bg-indigo-600 text-white px-3 rounded hover:bg-indigo-500">添加</button>
                      </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                      <button onClick={handleDeleteProject} className="w-full py-2 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold transition-colors">删除此项目</button>
                  </div>
              </div>
              <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
                  <Button size="sm" onClick={handleSaveProjectSettings}>保存更改</Button>
              </div>
           </div>
        )}

        {/* Project List */}
        <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
           <div className="h-10 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900">
             <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">项目列表</span>
             <span className="text-[10px] text-slate-600 font-mono">{filteredProjects.length}</span>
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
             {filteredProjects.map(p => (
               <div key={p.id} onClick={() => onSelectProject(p.id)} className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-between group border relative ${p.id === activeProjectId ? 'bg-slate-800 border-slate-700 text-white shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}`}>
                 <div className="min-w-0 flex-1 pr-6">
                   <div className="text-sm font-medium truncate">{p.name}</div>
                   <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-600 font-mono">{new Date(p.updatedAt).toLocaleDateString()}</span>
                      {p.tags.slice(0, 2).map(t => <span key={t} className="text-[9px] bg-slate-950 px-1.5 py-0 rounded text-slate-500 border border-slate-800">{t}</span>)}
                   </div>
                 </div>
                 {p.id === activeProjectId && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] absolute right-3 top-1/2 -translate-y-1/2"></div>}
                 <button onClick={(e) => openProjectSettings(e, p)} className="absolute right-2 top-2 p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></button>
               </div>
             ))}
           </div>
        </div>

        {/* Version List */}
        <div className="h-[60%] flex flex-col min-h-0 bg-slate-950">
           <div className="h-10 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur">
             <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">版本控制</span>
             <div className="flex gap-2"><span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">{versions.length} Ver</span></div>
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-0 relative">
             {versions.length > 0 && <div className="absolute left-[27px] top-4 bottom-4 w-px bg-slate-800 z-0"></div>}
             <div className="space-y-0 pb-4">
               {versions.map((v, idx) => {
                 const { charCount, charDiff, previous, parentName } = getVersionStats(idx);
                 const isLatest = idx === 0;
                 const hasNotes = v.notes && v.notes.trim().length > 0;
                 return (
                 <div key={v.id} onClick={() => onSelectVersion(v)} className={`relative pl-10 pr-3 py-3 border-b border-slate-900/50 cursor-pointer transition-all group z-10 ${v.id === activeVersionId ? 'bg-slate-900/60' : 'hover:bg-slate-900/30'}`}>
                    <div className={`absolute left-5 top-6 w-3.5 h-3.5 rounded-full border-2 z-20 flex items-center justify-center transition-all ${v.id === activeVersionId ? 'border-indigo-500 bg-slate-950 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'border-slate-700 bg-slate-950 group-hover:border-slate-500'}`}>
                        {v.id === activeVersionId && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>}
                    </div>
                    <div className={`rounded-lg p-3 border transition-all ${v.id === activeVersionId ? 'bg-indigo-900/10 border-indigo-500/30' : 'bg-transparent border-transparent group-hover:border-slate-800'}`}>
                        <div className="mb-2">
                             {parentName && <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><span>from <span className="font-mono text-indigo-400/70">{parentName}</span></span></div>}
                             {hasNotes ? <div className={`text-xs font-medium leading-relaxed line-clamp-2 ${v.id === activeVersionId ? 'text-indigo-100' : 'text-slate-200'}`}>{v.notes}</div> : <div className={`text-xs font-medium ${v.id === activeVersionId ? 'text-indigo-100' : 'text-slate-300'}`}>{v.name}</div>}
                             <div className="flex items-center gap-2 mt-1.5">
                                {getTypeIcon(v.type)}
                                {hasNotes && <span className={`text-[10px] font-mono px-1.5 rounded border ${v.id === activeVersionId ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{v.name}</span>}
                                <span className="text-[10px] text-slate-500 font-mono">{new Date(v.createdAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                {isLatest && <span className="text-[8px] bg-indigo-500 text-white px-1 py-0.5 rounded font-bold tracking-wider ml-auto">LATEST</span>}
                             </div>
                        </div>
                        <div className="flex items-center justify-end gap-1 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); onForkVersion(v); }} className="text-slate-500 hover:text-emerald-400 p-1.5 hover:bg-emerald-900/20 rounded bg-slate-950/80 backdrop-blur border border-slate-700 shadow-sm" title="Fork"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg></button>
                            {previous && <button onClick={(e) => { e.stopPropagation(); onCompareVersion(v, previous); }} className="text-slate-500 hover:text-indigo-400 p-1.5 hover:bg-indigo-900/20 rounded bg-slate-950/80 backdrop-blur border border-slate-700 shadow-sm" title="Diff"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg></button>}
                            {versions.length > 1 && <button onClick={(e) => { e.stopPropagation(); onDeleteVersion(v.id); }} className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-red-900/20 rounded bg-slate-950/80 backdrop-blur border border-slate-700 shadow-sm" title="删除"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>}
                        </div>
                        
                        {/* Redesigned Config Display */}
                        <div className="grid grid-cols-1 gap-2 mt-2">
                             <div className="bg-slate-900/50 rounded border border-slate-800/50 px-2 py-1.5 flex flex-col">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Model Config</span>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-indigo-300 font-medium truncate" title={getModelName(v.model)}>
                                        {getModelName(v.model)}
                                    </span>
                                    <div className="flex gap-2">
                                        <span className="text-[9px] text-slate-400 bg-slate-800 px-1 rounded font-mono">T: {v.config.temperature}</span>
                                        <span className="text-[9px] text-slate-400 bg-slate-800 px-1 rounded font-mono">Size: {charCount}</span>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                 </div>
               )})}
             </div>
           </div>
        </div>

      </div>
    </div>
  );
};

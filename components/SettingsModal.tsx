

import React, { useState } from 'react';
import { LLMConfig } from '../types';
import { Button } from './Button';
import { useAuth } from '../contexts/AuthContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedAPIs: LLMConfig[];
  onUpdateAPIs: (apis: LLMConfig[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  savedAPIs,
  onUpdateAPIs
}) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<LLMConfig | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<'gemini' | 'openai-compatible'>('gemini');
  const [formModelId, setFormModelId] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  if (!isOpen) return null;

  const handleEdit = (api: LLMConfig) => {
    setCurrentConfig(api);
    setFormName(api.name);
    setFormProvider(api.provider);
    setFormModelId(api.modelId);
    setFormBaseUrl(api.baseUrl || '');
    setFormApiKey(api.apiKey || '');
    setFormIsDefault(!!api.isDefault);
    setIsEditing(true);
  };

  const handleAddNew = () => {
    setCurrentConfig(null);
    setFormName('New API Config');
    setFormProvider('gemini');
    setFormModelId('gemini-2.5-flash');
    setFormBaseUrl('');
    setFormApiKey('');
    setFormIsDefault(savedAPIs.length === 0);
    setIsEditing(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定删除此 API 配置吗?')) {
        onUpdateAPIs(savedAPIs.filter(a => a.id !== id));
        if (currentConfig?.id === id) setIsEditing(false);
    }
  };

  const handleSave = () => {
    if (!formName || !formModelId) return;
    
    const newConfig: LLMConfig = {
        id: currentConfig ? currentConfig.id : `api-${Date.now()}`,
        userId: user?.id || 'anonymous',
        name: formName,
        provider: formProvider,
        modelId: formModelId,
        baseUrl: formProvider === 'openai-compatible' ? formBaseUrl : undefined,
        apiKey: formApiKey || undefined,
        isDefault: formIsDefault
    };

    let updatedAPIs = [...savedAPIs];

    if (currentConfig) {
        // Update existing
        updatedAPIs = updatedAPIs.map(a => a.id === currentConfig.id ? newConfig : a);
    } else {
        // Add new
        updatedAPIs.push(newConfig);
    }

    // Handle Default Logic: Ensure only one is default
    if (formIsDefault) {
        updatedAPIs = updatedAPIs.map(a => ({
            ...a,
            isDefault: a.id === newConfig.id ? true : false
        }));
    }

    onUpdateAPIs(updatedAPIs);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">API 连接管理 (Connection Manager)</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
            {/* Left Side: List */}
            <div className="w-1/3 min-w-[220px] border-r border-slate-800 bg-slate-950/50 flex flex-col">
                <div className="p-3 border-b border-slate-800">
                    <button 
                        onClick={handleAddNew}
                        className="w-full text-xs font-bold flex items-center justify-center gap-2 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-900/20"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        添加新接口
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {savedAPIs.map(api => (
                        <div 
                            key={api.id}
                            onClick={() => handleEdit(api)}
                            className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${currentConfig?.id === api.id && isEditing ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/20' : 'bg-slate-900/40 border-transparent hover:bg-slate-800'}`}
                        >
                             <div className="flex justify-between items-start mb-1">
                                <span className={`font-bold text-xs truncate ${currentConfig?.id === api.id && isEditing ? 'text-indigo-300' : 'text-slate-300'}`}>
                                    {api.name}
                                </span>
                                {api.isDefault && (
                                    <span className="text-[8px] bg-slate-700 text-white px-1.5 rounded-full">DEFAULT</span>
                                )}
                             </div>
                             <div className="flex items-center gap-2">
                                <span className={`text-[9px] px-1 rounded font-mono ${api.provider === 'gemini' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                    {api.provider === 'gemini' ? 'GEMINI' : 'OPENAI'}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono truncate flex-1">{api.modelId}</span>
                             </div>
                             
                             <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(api.id); }}
                                className="absolute top-2 right-2 p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all bg-slate-900/80 rounded shadow-sm"
                                title="删除"
                             >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                             </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Side: Edit Form */}
            <div className="flex-1 bg-slate-900 flex flex-col">
               {!isEditing ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                     <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                     </div>
                     <h3 className="text-slate-300 font-bold mb-1">选择或新建配置</h3>
                     <p className="text-xs text-slate-500 max-w-xs">从左侧列表选择一个 API 进行编辑，或点击上方按钮添加新的模型接口。</p>
                  </div>
               ) : (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                     <h3 className="text-sm font-bold text-white mb-6 pb-2 border-b border-slate-800">编辑配置 (Edit Config)</h3>
                     <div className="space-y-6 max-w-lg">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">配置名称 (Display Name)</label>
                            <input 
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                              placeholder="例如: 公司内部 GPT-4"
                              value={formName}
                              onChange={(e) => setFormName(e.target.value)}
                            />
                         </div>

                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">服务提供商 (Provider Type)</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                  onClick={() => setFormProvider('gemini')}
                                  className={`py-3 px-4 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-2 ${formProvider === 'gemini' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                >
                                    <span className="text-lg">Gemini</span>
                                    <span className="font-normal opacity-80">Google Official</span>
                                </button>
                                <button 
                                  onClick={() => setFormProvider('openai-compatible')}
                                  className={`py-3 px-4 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-2 ${formProvider === 'openai-compatible' ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                >
                                    <span className="text-lg">OpenAI</span>
                                    <span className="font-normal opacity-80">Compatible API</span>
                                </button>
                            </div>
                         </div>

                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">模型 ID (Model Identifier)</label>
                            <input 
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono transition-colors"
                              placeholder={formProvider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}
                              value={formModelId}
                              onChange={(e) => setFormModelId(e.target.value)}
                            />
                            <p className="text-[10px] text-slate-500 mt-1">对应 API 请求中的 <code>model</code> 参数。</p>
                         </div>

                         {formProvider === 'openai-compatible' && (
                             <div className="animate-fadeIn">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Base URL (Endpoint)</label>
                                <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono transition-colors"
                                placeholder="https://api.deepseek.com/v1"
                                value={formBaseUrl}
                                onChange={(e) => setFormBaseUrl(e.target.value)}
                                />
                                <p className="text-[10px] text-slate-500 mt-1">通常以 /v1 结尾。如果留空，将使用官方默认地址。</p>
                             </div>
                         )}

                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">API Key (Secret)</label>
                            <input 
                              type="password"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono transition-colors"
                              placeholder="sk-..."
                              value={formApiKey}
                              onChange={(e) => setFormApiKey(e.target.value)}
                            />
                            <p className="text-[10px] text-slate-500 mt-1">密钥仅存储在本地浏览器中，不会上传到服务器。</p>
                         </div>
                         
                         <div className="pt-2">
                             <label className="flex items-center gap-2 cursor-pointer group">
                                 <input 
                                    type="checkbox" 
                                    className="hidden" 
                                    checked={formIsDefault} 
                                    onChange={e => setFormIsDefault(e.target.checked)}
                                 />
                                 <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${formIsDefault ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950 border-slate-700 group-hover:border-slate-500'}`}>
                                     {formIsDefault && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                 </div>
                                 <span className="text-xs text-slate-300 font-medium">设为默认模型 (Set as Default)</span>
                             </label>
                             <p className="text-[10px] text-slate-500 mt-1 ml-6">勾选后，新建项目或服务时将默认选中此配置。</p>
                         </div>
                     </div>
                  </div>
               )}
               
               {isEditing && (
                  <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setIsEditing(false)}>取消</Button>
                    <Button variant="primary" onClick={handleSave}>保存配置</Button>
                  </div>
               )}
            </div>
        </div>
      </div>
    </div>
  );
};
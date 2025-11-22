
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';

export const LoginView: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isRegistering) {
        await register(username, password, email);
      } else {
        await login(username, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center relative overflow-hidden">
       {/* Background Decorations */}
       <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
       <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none"></div>

       <div className="z-10 w-full max-w-md p-8">
          <div className="text-center mb-8">
             <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-900/40 mb-4 transform rotate-3">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
             </div>
             <h1 className="text-3xl font-bold text-white tracking-tight mb-2">PromptLab AI</h1>
             <p className="text-slate-400 text-sm">专业的提示词工程与 LLM 版本控制平台</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
             <div className="flex gap-4 mb-8 border-b border-slate-800/50 pb-1">
                <button 
                  onClick={() => setIsRegistering(false)}
                  className={`flex-1 pb-3 text-sm font-bold transition-all relative ${!isRegistering ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                   登录
                   {!isRegistering && <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>}
                </button>
                <button 
                  onClick={() => setIsRegistering(true)}
                  className={`flex-1 pb-3 text-sm font-bold transition-all relative ${isRegistering ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                   注册账号
                   {isRegistering && <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>}
                </button>
             </div>

             {error && (
               <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {error}
               </div>
             )}

             <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">用户名</label>
                   <input 
                      required
                      type="text"
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="yourname"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                   />
                </div>

                {isRegistering && (
                   <div className="animate-fadeIn">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">电子邮箱</label>
                      <input 
                         required
                         type="email"
                         className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                         placeholder="name@example.com"
                         value={email}
                         onChange={e => setEmail(e.target.value)}
                      />
                   </div>
                )}

                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">密码</label>
                   <input 
                      required
                      type="password"
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                   />
                </div>

                <div className="pt-4">
                   <Button 
                     type="submit" 
                     className="w-full py-3 shadow-lg shadow-indigo-600/20" 
                     size="lg"
                     isLoading={isLoading}
                   >
                      {isRegistering ? '创建账户' : '进入工作室'}
                   </Button>
                </div>
             </form>

             <div className="mt-6 text-center text-[10px] text-slate-600">
                提示：数据仅存储在您的本地浏览器中。<br/>
                {isRegistering && "首次注册将自动继承所有现有的本地数据。"}
             </div>
          </div>
       </div>
    </div>
  );
};


import React, { useState } from 'react';
import { PromptVersion, VariableMap, SimulationResult, LLMConfig } from '../types';
import { Button } from './Button';
import { generateContent, generateChat } from '../services/geminiService';
import { DEFAULT_MODELS } from '../constants';

interface SimulateViewProps {
  activeVersion: PromptVersion;
  variables: string[];
}

export const SimulateView: React.FC<SimulateViewProps> = ({
  activeVersion,
  variables,
}) => {
  const [testCases, setTestCases] = useState<VariableMap[]>([{}]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState(activeVersion.model);

  const addTestCase = () => {
    setTestCases([...testCases, {}]);
  };

  const removeTestCase = (index: number) => {
    if (testCases.length > 1) {
      setTestCases(testCases.filter((_, i) => i !== index));
    }
  };

  const updateTestCase = (index: number, key: string, value: string) => {
    const newCases = [...testCases];
    newCases[index] = { ...newCases[index], [key]: value };
    setTestCases(newCases);
  };

  const runSimulation = async () => {
    setIsRunning(true);
    const newResults: SimulationResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const inputs = testCases[i];
      
      const start = Date.now();
      const llmConfig: LLMConfig = { 
        id: 'sim-temp',
        userId: activeVersion.userId,
        name: 'Simulation Model',
        provider: 'gemini', 
        modelId: selectedModel 
      };
      
      try {
        let output;
        if (activeVersion.type === 'chat' && activeVersion.messages) {
             // Process Chat History: Replace variables in all messages
             const processedMessages = activeVersion.messages.map(msg => {
                let content = msg.content;
                for (const [key, value] of Object.entries(inputs)) {
                    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
                }
                return { ...msg, content };
             });
             output = await generateChat(llmConfig, processedMessages, activeVersion.systemInstruction, activeVersion.config);
        } else {
             // Process Text Prompt
             let prompt = activeVersion.content;
             for (const [key, value] of Object.entries(inputs)) {
                prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
             }
             output = await generateContent(llmConfig, prompt, activeVersion.systemInstruction, activeVersion.config);
        }

        const latency = Date.now() - start;

        newResults.push({
            id: `sim-${Date.now()}-${i}`,
            inputs,
            outputs: {
            [activeVersion.id]: { output, latency }
            }
        });
      } catch (e) {
          console.error(e);
      }
    }

    setResults(newResults);
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col h-full gap-4 bg-slate-950 p-6">
      {/* Configuration Panel */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">批量推演 (Batch Simulation)</h2>
            <p className="text-slate-500 text-xs mt-1">针对多个测试用例运行当前版本，验证提示词在不同输入下的表现。</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">模型:</span>
                <select 
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                    {DEFAULT_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
             </div>
            <Button onClick={runSimulation} isLoading={isRunning} size="md" className="shadow-lg shadow-indigo-900/30">
              开始推演 ({testCases.length})
            </Button>
          </div>
        </div>

        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
           <div className="grid gap-4 items-end" style={{ gridTemplateColumns: `repeat(${variables.length}, 1fr) 40px` }}>
             {variables.map(v => (
               <span key={v} className="text-[10px] font-bold text-indigo-400 uppercase mb-1 font-mono">{`{{${v}}}`}</span>
             ))}
             <span></span>
           </div>
           
           {testCases.map((tc, idx) => (
             <div key={idx} className="grid gap-4 items-center animate-fadeIn group" style={{ gridTemplateColumns: `repeat(${variables.length}, 1fr) 40px` }}>
               {variables.map(v => (
                 <input
                    key={v}
                    type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none transition-colors focus:bg-black"
                    placeholder={`输入 ${v}`}
                    value={tc[v] || ''}
                    onChange={(e) => updateTestCase(idx, v, e.target.value)}
                 />
               ))}
               <button 
                 onClick={() => removeTestCase(idx)}
                 className="text-slate-600 hover:text-red-400 transition-colors p-2 flex justify-center opacity-50 group-hover:opacity-100"
                 disabled={testCases.length === 1}
                 title="删除此用例"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
             </div>
           ))}
        </div>
        
        <div className="mt-4 border-t border-slate-800 pt-4">
           <Button variant="secondary" size="sm" onClick={addTestCase} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>}>
             添加测试用例
           </Button>
        </div>
      </div>

      {/* Results Panel */}
      {results.length > 0 && (
        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-xl">
           <div className="px-6 py-3 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
             <h3 className="font-semibold text-slate-200 text-sm">推演结果报告</h3>
             <div className="text-[10px] text-slate-500">共 {results.length} 条记录</div>
           </div>
           <div className="overflow-auto flex-1 p-0 custom-scrollbar">
             <table className="w-full text-left text-sm text-slate-400">
               <thead className="bg-slate-950 text-slate-500 font-medium uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-sm">
                 <tr>
                   <th className="px-6 py-3 border-b border-slate-800 w-1/4">输入变量 (Inputs)</th>
                   <th className="px-6 py-3 border-b border-slate-800">输出结果 (Output)</th>
                   <th className="px-6 py-3 border-b border-slate-800 w-32 text-right">指标 (Metrics)</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/50">
                 {results.map((res) => {
                   const outputData = res.outputs[activeVersion.id];
                   return (
                    <tr key={res.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 align-top bg-slate-950/30">
                        <div className="space-y-2">
                          {Object.entries(res.inputs).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[auto_1fr] gap-2">
                              <span className="font-mono text-[10px] text-indigo-400 bg-indigo-900/20 px-1.5 rounded border border-indigo-500/20">{`{{${k}}}`}</span>
                              <span className="text-slate-300 truncate text-xs font-mono">{v}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 whitespace-pre-wrap font-mono text-xs leading-relaxed selection:bg-indigo-500/30">
                        {outputData ? outputData.output.text : <span className="text-slate-600 italic">No result for this version</span>}
                      </td>
                      <td className="px-6 py-4 text-[10px] font-mono text-slate-500 align-top text-right space-y-1">
                        {outputData && (
                          <>
                            <div className="text-emerald-500">{outputData.latency}ms</div>
                            <div>T: {outputData.output.tokenUsage.totalTokens}</div>
                          </>
                        )}
                      </td>
                    </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
};

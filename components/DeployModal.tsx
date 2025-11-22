
import React, { useState } from 'react';
import { PromptVersion, VariableMap, LLMConfig } from '../types';
import { Button } from './Button';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeVersion: PromptVersion;
  activeModel: LLMConfig;
}

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  onClose,
  activeVersion,
  activeModel
}) => {
  const [activeTab, setActiveTab] = useState<'python' | 'js' | 'curl'>('python');

  if (!isOpen) return null;

  const variables = (activeVersion.content.match(/{{([^}]+)}}/g) || []).map(s => s.replace(/{{|}}/g, ''));
  const pyStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const pythonPrompt = activeVersion.content.replace(/{{(\w+)}}/g, '{$1}');
  
  const getPythonCode = () => {
    if (activeModel.provider === 'gemini') {
       return `# Requires: pip install google-genai
import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

response = client.models.generate_content(
    model="${activeModel.modelId}",
    config=types.GenerateContentConfig(
        system_instruction="${pyStr(activeVersion.systemInstruction || '')}",
        temperature=${activeVersion.config.temperature},
        top_p=${activeVersion.config.topP},
        top_k=${activeVersion.config.topK},
        response_mime_type="${activeVersion.config.responseMimeType}",
    ),
    contents=[f"""${pythonPrompt}"""]
)

print(response.text)`;
    }

    return `# Requires: pip install openai
import os
from openai import OpenAI

client = OpenAI(
    base_url="${activeModel.baseUrl || 'https://api.openai.com/v1'}",
    api_key=os.environ["OPENAI_API_KEY"]
)

response = client.chat.completions.create(
    model="${activeModel.modelId}",
    messages=[
        {"role": "system", "content": "${pyStr(activeVersion.systemInstruction || '')}"},
        {"role": "user", "content": f"""${pythonPrompt}"""}
    ],
    temperature=${activeVersion.config.temperature},
    top_p=${activeVersion.config.topP}
)

print(response.choices[0].message.content)`;
  };

  const getJSCode = () => {
    return `// Using Fetch API
const generate = async (inputs) => {
  let prompt = \`${activeVersion.content}\`;
  for (const [key, val] of Object.entries(inputs)) {
    prompt = prompt.replace(new RegExp(\`{{\${key}}}\`, 'g'), val);
  }

  const response = await fetch('${activeModel.provider === 'openai-compatible' ? (activeModel.baseUrl || 'https://api.openai.com/v1') + '/chat/completions' : `https://generativelanguage.googleapis.com/v1beta/models/${activeModel.modelId}:generateContent?key=YOUR_API_KEY`}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ${activeModel.provider === 'openai-compatible' ? "'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY" : ''}
    },
    body: JSON.stringify({
      ${activeModel.provider === 'openai-compatible' ? 
      `model: "${activeModel.modelId}",
      messages: [
        { role: "system", content: ${JSON.stringify(activeVersion.systemInstruction || '')} },
        { role: "user", content: prompt }
      ],
      temperature: ${activeVersion.config.temperature}` : 
      `contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: ${JSON.stringify(activeVersion.systemInstruction || '')} }] },
      generationConfig: {
        temperature: ${activeVersion.config.temperature},
        topP: ${activeVersion.config.topP},
        topK: ${activeVersion.config.topK}
      }`
      }
    })
  });

  const data = await response.json();
  return data;
}`;
  };

  const getCurlCode = () => {
    if (activeModel.provider === 'openai-compatible') {
        return `curl --location '${activeModel.baseUrl || 'https://api.openai.com/v1'}/chat/completions' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer $OPENAI_API_KEY' \\
--data '{
    "model": "${activeModel.modelId}",
    "messages": [
        {"role": "system", "content": ${JSON.stringify(activeVersion.systemInstruction || '')}},
        {"role": "user", "content": "${activeVersion.content.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"}
    ],
    "temperature": ${activeVersion.config.temperature}
}'`;
    }
    return `curl --location 'https://generativelanguage.googleapis.com/v1beta/models/${activeModel.modelId}:generateContent?key=$GOOGLE_API_KEY' \\
--header 'Content-Type: application/json' \\
--data '{
    "contents": [{ "parts": [{ "text": "${activeVersion.content.replace(/\n/g, '\\n').replace(/"/g, '\\"')}" }]}],
    "systemInstruction": { "parts": [{ "text": ${JSON.stringify(activeVersion.systemInstruction || '')} }]},
    "generationConfig": {
        "temperature": ${activeVersion.config.temperature},
        "topP": ${activeVersion.config.topP},
        "topK": ${activeVersion.config.topK}
    }
}'`;
  };

  const getCode = () => {
    switch(activeTab) {
        case 'python': return getPythonCode();
        case 'js': return getJSCode();
        case 'curl': return getCurlCode();
        default: return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
             </div>
             <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">集成 API (Integration)</h2>
                <p className="text-[10px] text-slate-500">将当前提示词版本集成到你的应用中</p>
             </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col p-6 overflow-hidden">
           <div className="flex gap-2 mb-4 border-b border-slate-800 pb-1">
              {(['python', 'js', 'curl'] as const).map(t => (
                  <button 
                    key={t} 
                    onClick={() => setActiveTab(t)}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                  >
                    {t}
                  </button>
              ))}
           </div>

           <div className="flex-1 relative bg-black rounded-lg border border-slate-800 overflow-hidden group">
              <button 
                className="absolute top-3 right-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2 py-1 rounded border border-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => navigator.clipboard.writeText(getCode())}
              >
                Copy
              </button>
              <pre className="h-full p-4 text-xs font-mono text-slate-300 overflow-auto custom-scrollbar leading-relaxed">
                {getCode()}
              </pre>
           </div>

           <div className="mt-4 bg-slate-900/50 border border-indigo-900/30 rounded p-3 flex gap-3">
              <div className="text-indigo-400 flex-shrink-0 mt-0.5">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                 提示：代码已生成，请确保在本地设置环境变量 <code>GOOGLE_API_KEY</code> 或 <code>OPENAI_API_KEY</code>。
              </div>
           </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
            <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
};

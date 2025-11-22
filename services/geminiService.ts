

import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, Attachment, LLMConfig, TokenUsage, LLMResponse, ChatMessage } from "../types";

// Helper to estimate tokens roughly if API doesn't return them (fallback)
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// Helper: Decode text file content from Base64 Data URI
const extractTextFromAttachment = (att: Attachment): string | null => {
  if (att.type !== 'text') return null;
  try {
    // Data URI format: "data:text/plain;base64,SGVsbG8=..."
    const base64 = att.data.split(',')[1];
    // Decode base64 to UTF-8 string in browser
    const binaryString = atob(base64);
    // Proper UTF-8 decoding for non-Latin characters
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error(`Failed to decode text attachment ${att.name}`, e);
    return null;
  }
};

// Helper: Inject attachments into prompt context
// This ensures textual files (code, json, md) are actually "read" by the model as context.
const injectAttachmentsToPrompt = (originalPrompt: string, attachments: Attachment[]): string => {
  let extendedPrompt = originalPrompt;
  let hasFiles = false;
  let fileContext = "";

  attachments.forEach(att => {
    const textContent = extractTextFromAttachment(att);
    if (textContent) {
       if (!hasFiles) {
         fileContext += "\n\n# 📎 Reference Files Context (Auto-injected):\n";
         hasFiles = true;
       }
       fileContext += `\n--- File: ${att.name} ---\n${textContent}\n--- End of File ---\n`;
    }
  });
  
  return extendedPrompt + fileContext;
};

// --- Gemini Implementation ---
const callGemini = async (
  config: LLMConfig, 
  prompt: string, 
  systemInstruction: string, 
  genConfig: GenerationConfig,
  attachments: Attachment[]
): Promise<LLMResponse> => {
  const apiKey = config.apiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("缺少 Google API Key");
  
  const ai = new GoogleGenAI({ apiKey });
  
  // 1. Inject text files into the prompt text (Context Injection)
  const finalPrompt = injectAttachmentsToPrompt(prompt, attachments);

  // 2. Handle Images (Multimodal)
  const parts: any[] = [];
  
  // Add image attachments only as separate parts
  attachments.forEach(att => {
    if (att.type === 'image') {
        const base64Data = att.data.split(',')[1] || att.data;
        parts.push({
            inlineData: {
                mimeType: att.mimeType,
                data: base64Data
            }
        });
    }
  });

  // Add text prompt (which now includes text file contents)
  parts.push({ text: finalPrompt });

  const response = await ai.models.generateContent({
    model: config.modelId,
    contents: {
      role: 'user',
      parts: parts
    },
    config: {
      systemInstruction: systemInstruction,
      temperature: genConfig.temperature,
      topP: genConfig.topP,
      topK: genConfig.topK,
      maxOutputTokens: genConfig.maxOutputTokens,
      responseMimeType: genConfig.responseMimeType,
    }
  });

  const usage = response.usageMetadata;
  
  return {
    text: response.text || "",
    tokenUsage: {
      inputTokens: usage?.promptTokenCount || estimateTokens(finalPrompt + systemInstruction),
      outputTokens: usage?.candidatesTokenCount || estimateTokens(response.text || ""),
      totalTokens: usage?.totalTokenCount || 0
    }
  };
};

// --- Gemini Chat Implementation ---
const callGeminiChat = async (
  config: LLMConfig,
  history: ChatMessage[],
  systemInstruction: string,
  genConfig: GenerationConfig,
  attachments: Attachment[] = [] // Support attachments in chat
): Promise<LLMResponse> => {
  const apiKey = config.apiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("缺少 Google API Key");

  const ai = new GoogleGenAI({ apiKey });

  // Clone history to avoid mutating props
  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }] as any[]
  }));

  // If there are attachments, we append them to the LAST user message
  if (attachments.length > 0 && contents.length > 0) {
      const lastMsg = contents[contents.length - 1];
      if (lastMsg.role === 'user') {
          // Inject Text Files
          const originalText = lastMsg.parts[0].text || "";
          const newText = injectAttachmentsToPrompt(originalText, attachments);
          lastMsg.parts[0].text = newText;

          // Inject Images
          attachments.forEach(att => {
              if (att.type === 'image') {
                  const base64Data = att.data.split(',')[1] || att.data;
                  lastMsg.parts.push({
                      inlineData: {
                          mimeType: att.mimeType,
                          data: base64Data
                      }
                  });
              }
          });
      }
  }

  const response = await ai.models.generateContent({
    model: config.modelId,
    contents: contents,
    config: {
      systemInstruction: systemInstruction,
      temperature: genConfig.temperature,
      topP: genConfig.topP,
      topK: genConfig.topK,
      maxOutputTokens: genConfig.maxOutputTokens,
      responseMimeType: genConfig.responseMimeType,
    }
  });

  const usage = response.usageMetadata;

  return {
    text: response.text || "",
    tokenUsage: {
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0
    }
  };
};


// --- OpenAI Compatible Implementation ---
const callOpenAICompatible = async (
  config: LLMConfig,
  prompt: string,
  systemInstruction: string,
  genConfig: GenerationConfig,
  attachments: Attachment[]
): Promise<LLMResponse> => {
  if (!config.baseUrl || !config.apiKey) throw new Error("自定义接口需要 Base URL 和 API Key");

  // 1. Inject text files into prompt
  const finalPrompt = injectAttachmentsToPrompt(prompt, attachments);

  const messages: any[] = [];
  
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  const userContent: any[] = [];
  
  // Add text
  userContent.push({ type: "text", text: finalPrompt });
  
  // Add images (OpenAI format)
  attachments.forEach(att => {
    if (att.type === 'image') {
      userContent.push({
        type: "image_url",
        image_url: {
          url: att.data // Base64 data URI works here
        }
      });
    }
  });

  messages.push({ role: "user", content: userContent });

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.modelId,
      messages: messages,
      temperature: genConfig.temperature,
      top_p: genConfig.topP,
      max_tokens: genConfig.maxOutputTokens,
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI 接口请求失败");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  return {
    text: content,
    tokenUsage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }
  };
};

// --- OpenAI Chat Implementation ---
const callOpenAICompatibleChat = async (
  config: LLMConfig,
  history: ChatMessage[],
  systemInstruction: string,
  genConfig: GenerationConfig,
  attachments: Attachment[] = []
): Promise<LLMResponse> => {
  if (!config.baseUrl || !config.apiKey) throw new Error("自定义接口需要 Base URL 和 API Key");

  const messages: any[] = [];

  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  // Map history to OpenAI format
  // Similar to Gemini, we inject attachments into the LAST user message
  const mappedHistory = history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content
  }));

  if (attachments.length > 0 && mappedHistory.length > 0) {
      const lastMsg = mappedHistory[mappedHistory.length - 1];
      if (lastMsg.role === 'user') {
           // Handle Text Injection
           if (typeof lastMsg.content === 'string') {
               lastMsg.content = injectAttachmentsToPrompt(lastMsg.content, attachments);
           }
           
           // Handle Images: Convert content to array format if needed
           const hasImages = attachments.some(a => a.type === 'image');
           if (hasImages) {
               const textContent = lastMsg.content;
               const newContentParts: any[] = [{ type: "text", text: textContent }];
               
               attachments.forEach(att => {
                   if (att.type === 'image') {
                       newContentParts.push({
                           type: "image_url",
                           image_url: { url: att.data }
                       });
                   }
               });
               lastMsg.content = newContentParts as any;
           }
      }
  }

  // Final push
  mappedHistory.forEach(m => messages.push(m));

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.modelId,
      messages: messages,
      temperature: genConfig.temperature,
      top_p: genConfig.topP,
      max_tokens: genConfig.maxOutputTokens,
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI 接口请求失败");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  return {
    text: content,
    tokenUsage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }
  };
};

// --- Main Export ---
export const generateContent = async (
  llmConfig: LLMConfig,
  prompt: string,
  systemInstruction: string = "",
  genConfig?: GenerationConfig,
  attachments: Attachment[] = []
): Promise<LLMResponse> => {
  const finalGenConfig = genConfig || {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    responseMimeType: 'text/plain'
  };

  try {
    if (llmConfig.provider === 'openai-compatible') {
      return await callOpenAICompatible(llmConfig, prompt, systemInstruction, finalGenConfig, attachments);
    } else {
      return await callGemini(llmConfig, prompt, systemInstruction, finalGenConfig, attachments);
    }
  } catch (error: any) {
    console.error("LLM Generation Error:", error);
    throw error;
  }
};

// --- Chat Export ---
export const generateChat = async (
  llmConfig: LLMConfig,
  history: ChatMessage[],
  systemInstruction: string = "",
  genConfig?: GenerationConfig,
  attachments: Attachment[] = [] // Added support
): Promise<LLMResponse> => {
  const finalGenConfig = genConfig || {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    responseMimeType: 'text/plain'
  };

  try {
     if (llmConfig.provider === 'openai-compatible') {
        return await callOpenAICompatibleChat(llmConfig, history, systemInstruction, finalGenConfig, attachments);
     } else {
        return await callGeminiChat(llmConfig, history, systemInstruction, finalGenConfig, attachments);
     }
  } catch (error: any) {
    console.error("Chat Generation Error:", error);
    throw error;
  }
};

// --- Optimizer ---
export const optimizePrompt = async (currentPrompt: string, goal: string, config: LLMConfig): Promise<string> => {
  const metaPrompt = `
    你是一位专家级的提示词工程师。
    请重写以下提示词以实现目标："${goal}"。
    原始提示词: "${currentPrompt}"
    要求: 必须使用中文回复，保留变量 {{x}}，只返回改进后的提示词文本，不要有其他废话。
  `;
  
  try {
    const res = await generateContent(config, metaPrompt, "", { temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain' });
    return res.text?.trim() || currentPrompt;
  } catch (e) {
    console.error(e);
    return currentPrompt;
  }
};
/**
 * @file ai-client.js
 * @description Provider-agnostic AI API wrapper for T&C Lens.
 * @module lib/ai-client
 */

const SYSTEM_PROMPT = `You are T&C Lens, an expert legal document analyzer. Your job is to read Terms of Service, Privacy Policies, and other legal agreements, then break them down into clear, actionable insights for everyday users.

## CRITICAL FIRST STEP — GATEKEEPER CHECK

Before analyzing, check if the text is actually a legal agreement document.

The text IS a legal agreement if it contains:
- Terms of Service / Terms and Conditions / Terms of Use
- Privacy Policy / Privacy Notice / Data Policy
- User Agreement / License Agreement / Subscription Agreement
- Acceptable Use Policy
- Cookie Policy
- Disclaimer / Liability limitations
- Any legal document where users agree to terms

The text is NOT a legal agreement if it:
- Is a blog post, news article, product description, or marketing content
- Is a homepage or navigation page with no legal content
- Is a login/signup form
- Is primarily images, menus, or UI elements with minimal text
- Is a generic webpage unrelated to legal terms

If the text is NOT a legal agreement, try to determine the URL of the actual legal agreement based on the domain of the page provided. Respond with ONLY this JSON (no explanation):
{"is_terms": false, "message": "This doesn't appear to be a Terms of Service, Privacy Policy, or legal agreement page.", "suggested_url": "https://example.com/terms"}

## ANALYSIS FORMAT (only if is_terms is true)

If the text IS a legal agreement, respond with this JSON structure:

{
  "is_terms": true,
  "risk_score": <number 0-100>,
  "summary": "<2-3 sentence plain-language summary>",
  "findings": [
    {
      "title": "<short descriptive title>",
      "importance": "<high|medium|low>",
      "description": "<2-4 sentence explanation of what this clause means and why it matters>",
      "quote": "<relevant exact quote from the text, if available>"
    }
  ]
}

## SCORING GUIDELINES

0-30 (Low Risk): Standard, balanced terms. User rights are reasonable, data practices are transparent, no surprising clauses.

31-60 (Medium Risk): Some concerning elements. Minor data sharing, one-sided modifications, limited liability, arbitration clauses, auto-renewal without clear notice.

61-100 (High Risk): Significantly problematic. Broad data harvesting, selling user data, no opt-out, binding arbitration with class-action waiver, unlimited liability waivers, surveillance-like tracking, content ownership claims over user data.

## IMPORTANCE CATEGORIES

HIGH importance: Issues that directly affect user rights, privacy, data, money, or legal protections.
MEDIUM importance: Issues that are important but less directly impactful.
LOW importance: Standard boilerplate that's generally expected and unremarkable.

## RULES

1. Respond in JSON only. No markdown, no code blocks, no explanations outside the JSON.
2. Be specific — reference actual clauses and quote relevant text.
3. Use plain, non-legal language that any user can understand.
4. Include 3-10 findings total, prioritizing the most important.
5. If a finding is very important, put it first.
6. Don't hallucinate clauses — only reference what's actually in the text.
7. If the text is very short or incomplete, note that in the summary.
8. Always include a quote when possible to back up each finding.`;

const PROVIDERS = {
  openai: {
    name: "OpenAI",
    apiType: "openai-compatible",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        maxTokens: 128000,
        inputCost: 2.5,
        outputCost: 10,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o-mini",
        maxTokens: 128000,
        inputCost: 0.15,
        outputCost: 0.6,
      },
    ],
    baseUrl: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
  },
  groq: {
    name: "Groq",
    apiType: "openai-compatible",
    analysisMaxInputTokens: 2500,
    maxOutputTokens: 1500,
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "deepseek-r1-distill-llama-70b",
        name: "DeepSeek R1 Distill Llama 70B",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  deepseek: {
    name: "DeepSeek",
    apiType: "openai-compatible",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        maxTokens: 64000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        maxTokens: 64000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://api.deepseek.com/chat/completions",
    modelsUrl: "https://api.deepseek.com/models",
  },
  mistral: {
    name: "Mistral AI",
    apiType: "openai-compatible",
    models: [
      {
        id: "mistral-large-latest",
        name: "Mistral Large",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "mistral-small-latest",
        name: "Mistral Small",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    modelsUrl: "https://api.mistral.ai/v1/models",
  },
  openrouter: {
    name: "OpenRouter",
    apiType: "openai-compatible",
    models: [
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        maxTokens: 1000000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "deepseek/deepseek-chat-v3-0324",
        name: "DeepSeek Chat V3",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B Instruct",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    headers: {
      "HTTP-Referer": "https://tc-lens.local",
      "X-Title": "T&C Lens",
    },
  },
  xai: {
    name: "xAI",
    apiType: "openai-compatible",
    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://api.x.ai/v1/chat/completions",
    modelsUrl: "https://api.x.ai/v1/models",
  },
  together: {
    name: "Together AI",
    apiType: "openai-compatible",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        name: "Llama 3.3 70B Turbo",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "DeepSeek V3",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        name: "Qwen 2.5 72B Turbo",
        maxTokens: 128000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://api.together.xyz/v1/chat/completions",
    modelsUrl: "https://api.together.xyz/v1/models",
  },
  anthropic: {
    name: "Anthropic",
    models: [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        maxTokens: 200000,
        inputCost: 3,
        outputCost: 15,
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        maxTokens: 200000,
        inputCost: 0.25,
        outputCost: 1.25,
      },
    ],
    baseUrl: "https://api.anthropic.com/v1/messages",
  },
  gemini: {
    name: "Google Gemini",
    models: [
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        maxTokens: 1000000,
        inputCost: 0,
        outputCost: 0,
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        maxTokens: 2000000,
        inputCost: 1.25,
        outputCost: 5,
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        maxTokens: 1000000,
        inputCost: 0,
        outputCost: 0,
      },
    ],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/",
  },
};

class TCLError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "TCLError";
  }
}

/**
 * Analyze extracted page text using the configured AI provider.
 *
 * @param {string} text - Extracted text content from the target page.
 * @param {Object} settings - User AI configuration.
 * @param {string} settings.provider - Provider ID.
 * @param {string} settings.apiKey - API key for the provider.
 * @param {string} settings.model - Model ID.
 * @param {string} url - Target page URL.
 * @returns {Promise<string>} Raw AI response text.
 * @throws {TCLError} When validation, network, auth, or provider errors occur.
 */
export async function analyze(text, settings, url) {
  const { provider, apiKey, model } = settings;

  if (!apiKey || !apiKey.trim()) {
    throw new TCLError("NO_API_KEY", "API key is not configured.");
  }

  if (!provider || !PROVIDERS[provider]) {
    throw new TCLError("INVALID_PROVIDER", `Unknown provider: ${provider}`);
  }

  switch (provider) {
    case "anthropic":
      return await analyzeWithAnthropic(text, apiKey, model, url);
    case "gemini":
      return await analyzeWithGemini(text, apiKey, model, url);
    default:
      if (PROVIDERS[provider].apiType === "openai-compatible") {
        return await analyzeWithOpenAICompatible(
          text,
          apiKey,
          model,
          PROVIDERS[provider],
          url,
        );
      }

      throw new TCLError(
        "INVALID_PROVIDER",
        `No handler for provider: ${provider}`,
      );
  }
}

/**
 * Estimate AI request cost for the selected model.
 *
 * @param {string} text - Text to analyze.
 * @param {string} provider - Provider ID.
 * @param {string} model - Model ID.
 * @returns {Object|null} Estimated token and cost details.
 */
export function estimateCost(text, provider, model) {
  const providerConfig = PROVIDERS[provider];
  const modelConfig = providerConfig?.models.find((item) => item.id === model);

  if (!modelConfig) return null;

  const inputTokens = Math.ceil((SYSTEM_PROMPT.length + text.length) / 4);
  const estimatedOutputTokens = 2000;
  const inputCost = (inputTokens / 1000000) * modelConfig.inputCost;
  const outputCost = (estimatedOutputTokens / 1000000) * modelConfig.outputCost;

  return {
    inputTokens,
    estimatedOutputTokens,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Get available AI providers and models.
 *
 * @returns {Object} Provider configuration map.
 */
export function getProviders() {
  return PROVIDERS;
}

/**
 * List available models for a provider when the provider exposes a useful model API.
 *
 * @param {string} provider - Provider ID.
 * @param {string} apiKey - API key for model discovery.
 * @returns {Promise<Array>} Models available for analysis.
 * @throws {TCLError} When model discovery fails.
 */
export async function listAvailableModels(provider, apiKey) {
  if (!provider || !PROVIDERS[provider]) {
    throw new TCLError("INVALID_PROVIDER", `Unknown provider: ${provider}`);
  }

  if (!apiKey || !apiKey.trim()) {
    throw new TCLError("NO_API_KEY", "API key is not configured.");
  }

  if (provider === "gemini") {
    return await listGeminiModels(apiKey);
  }

  if (PROVIDERS[provider].apiType === "openai-compatible") {
    return await listOpenAICompatibleModels(PROVIDERS[provider], apiKey);
  }

  return PROVIDERS[provider].models;
}

/**
 * Prepare page text for the selected model context window.
 *
 * Keeps the beginning of the document — where definitions, scope, and the
 * most important clauses typically appear in legal agreements.
 *
 * @param {string} rawText - Raw extracted page text.
 * @param {number} maxTokens - Maximum approximate input tokens.
 * @returns {{ text: string, wasTruncated: boolean }} Prepared text and flag.
 */
export function prepareTextForAI(rawText, maxTokens = 8000) {
  const maxChars = maxTokens * 4;
  const text = (rawText || "").trim();
  const wasTruncated = text.length > maxChars;

  const prepared = wasTruncated
    ? `${text.slice(0, maxChars)}\n\n[Note: Document was truncated — ${Math.round(text.length / 1000)}k characters total, showing first ${Math.round(maxChars / 1000)}k.]`
    : text;

  return { text: prepared, wasTruncated };
}

async function listGeminiModels(apiKey) {
  const response = await fetchWithTimeout(
    `${PROVIDERS.gemini.baseUrl.replace(/\/$/, "")}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  );

  if (response.status !== 200) {
    await throwProviderError(response, "Gemini");
  }

  const data = await response.json();

  return (data.models || [])
    .filter((model) =>
      model.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((model) => ({
      id: normalizeGeminiModelId(model.name),
      name: model.displayName || normalizeGeminiModelId(model.name),
      maxTokens: model.inputTokenLimit || 1000000,
      inputCost: 0,
      outputCost: 0,
    }));
}

async function listOpenAICompatibleModels(providerConfig, apiKey) {
  if (!providerConfig.modelsUrl) return providerConfig.models;

  const response = await fetchWithTimeout(providerConfig.modelsUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(providerConfig.headers || {}),
    },
  });

  if (response.status !== 200) {
    await throwProviderError(response, providerConfig.name);
  }

  const data = await response.json();
  const models = Array.isArray(data.data) ? data.data : data.models || [];
  const compatibleModels = models
    .map(normalizeOpenAICompatibleModel)
    .filter((model) => isLikelyChatModel(model.id));

  return compatibleModels.length > 0 ? compatibleModels : providerConfig.models;
}

async function analyzeWithOpenAICompatible(
  text,
  apiKey,
  model,
  providerConfig,
  url,
) {
  const response = await fetchWithTimeout(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(providerConfig.headers || {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(text, url) },
      ],
      temperature: 0.1,
      max_tokens: providerConfig.maxOutputTokens || 4000,
    }),
  });

  return await handleOpenAICompatibleResponse(response, providerConfig.name);
}

async function analyzeWithAnthropic(text, apiKey, model, url) {
  const response = await fetchWithTimeout(PROVIDERS.anthropic.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: PROVIDERS.anthropic.maxOutputTokens || 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(text, url) }],
    }),
  });

  return await handleAnthropicResponse(response);
}

async function analyzeWithGemini(text, apiKey, model, url) {
  const modelId = normalizeGeminiModelId(model);
  const endpointUrl = `${PROVIDERS.gemini.baseUrl}${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserMessage(text, url)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4000,
      },
    }),
  });

  return await handleGeminiResponse(response);
}

async function fetchWithTimeout(url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new TCLError("TIMEOUT", "The AI service took too long to respond.");
    }

    throw new TCLError(
      "NETWORK_ERROR",
      "Could not reach the AI service. Check your internet connection.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleOpenAICompatibleResponse(response, providerName) {
  if (response.status === 200) {
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";
  }

  await throwProviderError(response, providerName);
}

async function handleAnthropicResponse(response) {
  if (response.status === 200) {
    const data = await response.json();
    return data.content?.[0]?.text || "";
  }

  await throwProviderError(response, "Anthropic");
}

async function handleGeminiResponse(response) {
  if (response.status === 200) {
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  await throwProviderError(response, "Gemini");
}

async function throwProviderError(response, providerName) {
  const details = await getErrorDetails(response);

  if (response.status === 401 || response.status === 403) {
    throw new TCLError(
      "INVALID_KEY",
      `Your ${providerName} API key was rejected.`,
    );
  }

  if (response.status === 400 && providerName === "Gemini") {
    throw new TCLError(
      "INVALID_KEY",
      "Your Gemini API key is invalid or the model name is wrong.",
    );
  }

  if (response.status === 429) {
    throw new TCLError(
      "RATE_LIMITED",
      `${providerName} rate limit reached. Wait a moment.`,
    );
  }

  if ([500, 502, 503, 504].includes(response.status)) {
    throw new TCLError(
      "RESPONSE_ERROR",
      `${providerName} service is temporarily unavailable.`,
    );
  }

  throw new TCLError(
    "RESPONSE_ERROR",
    `${providerName} returned status ${response.status}. ${details}`.trim(),
  );
}

async function getErrorDetails(response) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || "";
  } catch {
    return "";
  }
}

function normalizeGeminiModelId(model) {
  return String(model || "gemini-2.5-flash").replace(/^models\//, "");
}

function normalizeOpenAICompatibleModel(model) {
  const id = String(model.id || model.name || "").replace(/^models\//, "");

  return {
    id,
    name: model.display_name || model.displayName || model.name || id,
    maxTokens:
      model.context_length ||
      model.contextLength ||
      model.max_context_length ||
      128000,
    inputCost: Number(model.pricing?.prompt || 0),
    outputCost: Number(model.pricing?.completion || 0),
  };
}

function isLikelyChatModel(modelId) {
  const id = modelId.toLowerCase();
  const rejectedTerms = [
    "embedding",
    "embed",
    "whisper",
    "tts",
    "dall-e",
    "image",
    "audio",
    "moderation",
    "rerank",
    "babbage",
    "davinci",
  ];

  return Boolean(modelId) && !rejectedTerms.some((term) => id.includes(term));
}

function buildUserMessage(text, url) {
  const domainContext = url ? `Page URL: ${url}\n\n` : "";
  return `${domainContext}Analyze the following text from a webpage. Extract all findings, assign importance levels, and calculate a risk score.\n\n---\n${text}\n---`;
}

export { TCLError };

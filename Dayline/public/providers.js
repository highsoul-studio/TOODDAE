// AI プロバイダの一覧。サーバ (設定の検査・呼び出し) とブラウザ (選択肢・入力欄) の両方から読む。DOM にも Node 固有の API にも触れないこと。
// モデル名は「候補」だけ (自由に入力できる)。モデルはよく入れ替わるので、確かなものだけを書き、残りは入力に任せる。

export const PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek', 'custom'];
export const VISIBLE_PROVIDERS = PROVIDERS.filter(p => p !== 'custom');

export const PROVIDER_INFO = {
  anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', needsKey: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5-20251001'], keyEnv: 'ANTHROPIC_API_KEY', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'], keyEnv: 'OPENAI_API_KEY', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', needsKey: true, models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], keyEnv: 'GEMINI_API_KEY', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', needsKey: true, models: ['deepseek-flash', 'deepseek-v4-pro'], keyEnv: 'DEEPSEEK_API_KEY', efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
  custom: { label: 'OpenAI compatible (Ollama / LM Studio …)', baseUrl: '', needsKey: false, models: [], keyEnv: '', efforts: [], defaultEffort: '' },
};

// 確認済みの候補と日付付き snapshot のみ。旧モデル・手入力の未確認モデルの能力を推測しない。
export function effortLevels(provider, model) {
  const info = PROVIDER_INFO[provider];
  if (!info || typeof model !== 'string') return [];
  const known = info.models.some(id => !id.startsWith('claude-haiku-') && (model === id || new RegExp('^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(?:20[0-9]{6}|20[0-9]{2}-[0-9]{2}-[0-9]{2})$').test(model)));
  return known ? info.efforts : [];
}

export const AUTH_MODES = Object.fromEntries(PROVIDERS.map(p => [p, p === 'openai' ? ['apikey', 'chatgpt'] : p === 'anthropic' ? ['apikey', 'claudeCode'] : ['apikey']]));

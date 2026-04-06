const http = require('http');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
const PORT               = 3002;        // Porta exclusiva (CodeLens=3000, JSMaster1=3001)
const OLLAMA_HOST        = 'localhost';
const OLLAMA_PORT        = 11434;
const OLLAMA_MODEL       = 'qwen2.5:1.5b';  // Troque pelo modelo instalado: mistral, codellama, etc.
const EXECUTION_TIMEOUT_MS = 15000;     // Tempo máximo para executar código do aluno
const OLLAMA_TIMEOUT_MS    = 180000;    // Tempo máximo para resposta do Ollama (ms)
const MAX_RETRIES         = 3;          // Máximo de tentativas para Ollama
const RETRY_DELAY_MS      = 500;        // Delay entre tentativas (ms)
// ──────────────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
};

// ── Chamada ao Ollama ──────────────────────────────────────────────────────────
function ollama(systemPrompt, userPrompt, callback) {
  // Validação de entrada
  if (!systemPrompt || !userPrompt) {
    return callback(null, 'Prompts obrigatórios');
  }
  if (systemPrompt.length > 5000 || userPrompt.length > 10000) {
    return callback(null, 'Prompt muito longo');
  }

  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const options = {
    hostname: OLLAMA_HOST,
    port: OLLAMA_PORT,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    log('info', 'OLLAMA request', { status: res.statusCode, message: res.statusMessage });
    res.on('data', chunk => {
      data += chunk;
      // Proteção contra resposta muito grande
      if (data.length > 100000) {
        req.destroy();
        return callback(null, 'Resposta do Ollama muito grande');
      }
    });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        log('error', 'OLLAMA status error', { status: res.statusCode, data: data.slice(0, 200) });
        return callback(null, `Erro Ollama: status ${res.statusCode}`);
      }
      try {
        const json = JSON.parse(data);
        if (json.error) {
          log('error', 'OLLAMA API error', { error: json.error });
          return callback(null, 'Erro Ollama: ' + json.error);
        }
        const responseText = json.message?.content || json.choices?.[0]?.message?.content || json.output?.[0]?.content || json.output || '';
        if (!responseText || !responseText.trim()) {
          log('warn', 'OLLAMA empty response', { json });
          return callback(null, 'Erro Ollama: resposta vazia');
        }
        log('info', 'OLLAMA success', { responseLength: responseText.length });
        callback(responseText.trim(), null);
      } catch(e) {
        log('error', 'OLLAMA JSON parse error', { error: e.message, data: data.slice(0, 200) });
        callback(null, 'Erro ao processar resposta do Ollama: ' + e.message);
      }
    });
  });

  req.on('error', (err) => {
    log('error', 'OLLAMA request error', { error: err.message });
    callback(null, 'Ollama não está respondendo. Execute "ollama serve" no terminal e tente novamente.');
  });

  req.setTimeout(OLLAMA_TIMEOUT_MS, () => {
    req.destroy();
    log('warn', 'OLLAMA timeout');
    callback(null, 'Timeout: o Ollama demorou demais. Tente um modelo menor ou aguarde.');
  });

  req.write(body);
  req.end();
}

// ── Logging estruturado ──────────────────────────────────────────────────────
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data
  };
  console.log(`[${level.toUpperCase()}] ${timestamp} - ${message}`, Object.keys(data).length ? data : '');
}

// Uso: log('info', 'Servidor iniciado', { port: PORT });
function validateString(input, fieldName, maxLength = 10000) {
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} deve ser uma string`);
  }
  if (input.length > maxLength) {
    throw new Error(`${fieldName} muito longo (máx. ${maxLength} caracteres)`);
  }
  return input.trim();
}

function validateArray(input, fieldName, maxItems = 100) {
  if (!Array.isArray(input)) {
    throw new Error(`${fieldName} deve ser um array`);
  }
  if (input.length > maxItems) {
    throw new Error(`${fieldName} tem muitos itens (máx. ${maxItems})`);
  }
  return input;
}

// ── Executar código JavaScript de forma segura ────────────────────────────────
function executarCodigoAluno(codigoAluno, timeoutMs = EXECUTION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      // Limitações de segurança
      if (codigoAluno.length > 10000) {
        resolve({
          sucesso: false,
          saida: '',
          erro: 'Código muito longo (máximo 10.000 caracteres)'
        });
        return;
      }

      // Verificar por código perigoso
      const dangerousPatterns = [
        /\brequire\s*\(/,
        /\bimport\s+/,
        /\bprocess\./,
        /\bfs\./,
        /\bchild_process\b/,
        /\beval\s*\(/,
        /\bFunction\s*\(/,
        /\bsetTimeout\s*\(/,
        /\bsetInterval\s*\(/,
        /\b__dirname\b/,
        /\b__filename\b/,
        /\bglobal\./,
        /\bBuffer\./
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(codigoAluno)) {
          resolve({
            sucesso: false,
            saida: '',
            erro: 'Código contém operações não permitidas'
          });
          return;
        }
      }

      const outputs = [];
      const sandbox = {
        console: {
          log: (...args) => {
            if (outputs.length < 100) { // Limita número de saídas
              outputs.push(args.map(arg => {
                if (typeof arg === 'object') return JSON.stringify(arg);
                return String(arg);
              }).join(' '));
            }
          },
          error: (...args) => outputs.push('[ERROR] ' + args.map(String).join(' ')),
          warn: (...args) => outputs.push('[WARN] ' + args.map(String).join(' ')),
        },
        // Funções globais seguras
        parseInt: global.parseInt,
        parseFloat: global.parseFloat,
        isNaN: global.isNaN,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Math: Math,
        Date: Date,
        JSON: global.JSON,
      };

      const script = new vm.Script(codigoAluno);
      const timer = setTimeout(() => {
        resolve({
          sucesso: false,
          saida: `[TIMEOUT] O código excedeu ${timeoutMs / 1000} segundos de execução`,
          erro: 'Timeout na execução'
        });
      }, timeoutMs);

      try {
        script.runInNewContext(sandbox, { timeout: timeoutMs });
        clearTimeout(timer);
        resolve({
          sucesso: true,
          saida: outputs.join('\n'),
          erro: null
        });
      } catch (e) {
        clearTimeout(timer);
        resolve({
          sucesso: false,
          saida: outputs.length > 0 ? outputs.join('\n') : '',
          erro: e.message || String(e)
        });
      }
    } catch (e) {
      resolve({
        sucesso: false,
        saida: '',
        erro: 'Erro ao preparar ambiente: ' + e.message
      });
    }
  });
}

function normalizeLooseJSON(text) {
  let cleaned = stripJSONComments(String(text).trim());
  
  // Tira código fences primeiro
  cleaned = cleaned.replace(/```(?:json|javascript)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  
  // Normaliza quebras de linha e espaços em branco excessivos
  cleaned = cleaned.replace(/\r\n|\r/g, '\n');
  cleaned = cleaned.replace(/\n+/g, ' ');
  
  // Caracteres especiais de aspas
  cleaned = cleaned.replace(/[""]/g, '"').replace(/['']/g, "'");
  
  // Espaçamento ao redor de pontuação JSON
  cleaned = cleaned.replace(/\s*:\s*/g, ':');
  cleaned = cleaned.replace(/\s*,\s*/g, ',');
  cleaned = cleaned.replace(/\s*{\s*/g, '{');
  cleaned = cleaned.replace(/\s*}\s*/g, '}');
  cleaned = cleaned.replace(/\s*\[\s*/g, '[');
  cleaned = cleaned.replace(/\s*]\s*/g, ']');
  
  // Fix chaves sem aspas (chave: valor -> "chave": valor)
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  
  // Fix valores single-quoted e backticks
  cleaned = cleaned.replace(/:(\s*)'([^']*)'/g, ':$1"$2"');
  cleaned = cleaned.replace(/:(\s*)`([^`]*)`/g, ':$1"$2"');
  
  // Remove virgular final antes de fechamento
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  return cleaned;
}

function stripJSONComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function findJSONObjects(text) {
  const objects = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      const prevCh = i > 0 ? text[i - 1] : '';
      if (inString) {
        if (ch === stringChar && prevCh !== '\\') {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (depth === 0) {
        objects.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  return objects;
}

function extractJSONFields(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const cleaned = stripJSONComments(text);
  const match = cleaned.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  const candidate = normalizeLooseJSON(match[0]);
  return tryJSONParse(candidate);
}

function parseVerifierResponse(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const primary = parseJSON(text);
  if (primary) return primary;
  return extractJSONFields(text);
}

async function ollamaAsync(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    ollama(systemPrompt, userPrompt, (text, err) => {
      if (err) return reject(err);
      resolve(text);
    });
  });
}

async function getVerifierResponse(systemPrompt, userPrompt, maxAttempts = MAX_RETRIES) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[VERIFICAR] tentativa ${attempt}/${maxAttempts} para obter resposta do verificador`);
      const text = await ollamaAsync(systemPrompt, userPrompt);
      if (typeof text === 'string' && text.trim().length > 0) {
        return text;
      }
      lastError = new Error('Resposta vazia do verificador');
    } catch (err) {
      lastError = err;
      console.error(`[VERIFICAR] erro na tentativa ${attempt}:`, err);
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError || new Error('Não foi possível obter resposta do verificador');
}

function extractQuotedText(text) {
  const match = String(text).match(/['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function parseArrayLike(text) {
  const trimmed = String(text).trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    return JSON.parse(trimmed.replace(/(['"])?([a-zA-Z0-9_\s!?.-]+)(['"])?/g, '"$2"'));
  } catch (e) {
    const inner = trimmed.slice(1, -1).trim();
    return inner.length === 0 ? [] : inner.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
  }
}

function isSingleCharArray(output) {
  const arr = parseArrayLike(output);
  if (!Array.isArray(arr)) return false;
  return arr.every(item => typeof item === 'string' && item.length === 1);
}

function extractAllQuotedText(text) {
  const matches = [];
  const regex = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function extractNumber(text) {
  const match = String(text).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseQuotedArray(text) {
  const match = String(text).match(/\[([^\]]+)\]/);
  if (!match) return null;
  return match[1].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function extractBoolean(text) {
  const lower = String(text).toLowerCase();
  if (lower.includes('true') || lower.includes('verdadeiro')) return true;
  if (lower.includes('false') || lower.includes('falso')) return false;
  return null;
}

function makeResult({ correto, pontuacao, resumo, o_que_fez_bem, problemas, sugestao }) {
  return {
    correto,
    pontuacao,
    resumo,
    o_que_fez_bem,
    problemas,
    sugestao,
    codigo_exemplo: '',
    solucoes_alternativas: [],
    conceitos_usados: []
  };
}

function heuristicCheck(enunciado, saidaReal) {
  const lower = String(enunciado).toLowerCase();
  const output = String(saidaReal).trim();
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const outputNumber = extractNumber(output);
  const outputBool = extractBoolean(output);
  const quoted = extractQuotedText(enunciado);
  const quotedAll = extractAllQuotedText(enunciado);

  console.log(`[HEURISTICA] Verificando enunciado: "${lower}"`);
  console.log(`[HEURISTICA] Saída: "${output}"`);

  if (/(quantas palavras|conta.*palavras|número de palavras)/.test(lower)) {
    const frase = extractQuotedText(enunciado);
    const expectedWordCount = frase ? countWords(frase) : null;
    const numbers = output.match(/\d+/g) || [];
    const firstNumber = numbers.length ? Number(numbers[0]) : null;

    if (expectedWordCount !== null) {
      if (output === String(expectedWordCount)) {
        return {
          correto: true,
          pontuacao: 100,
          resumo: 'Saída correta: número de palavras corresponde ao enunciado.',
          o_que_fez_bem: 'Conta corretamente as palavras.',
          problemas: null,
          sugestao: 'Nada a ajustar.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
      if (output.includes(frase) && firstNumber === expectedWordCount) {
        return {
          correto: true,
          pontuacao: 100,
          resumo: 'Saída correta: frase e contagem de palavras estão corretas.',
          o_que_fez_bem: 'Mostra o texto e a quantidade correta de palavras.',
          problemas: null,
          sugestao: 'Nada a ajustar.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
      if (output.includes(frase) && firstNumber !== null && firstNumber !== expectedWordCount) {
        return {
          correto: false,
          pontuacao: 0,
          resumo: 'A saída mostra a frase, mas o número não corresponde à quantidade de palavras.',
          o_que_fez_bem: 'A frase correta está presente.',
          problemas: 'Número incorreto de palavras.',
          sugestao: 'Verifique se está contando palavras, não caracteres.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
      if (firstNumber !== null && firstNumber === expectedWordCount) {
        return {
          correto: true,
          pontuacao: 100,
          resumo: 'Saída correta: categoria de palavras está correta mesmo sem repetir a frase.',
          o_que_fez_bem: 'Conta corretamente as palavras.',
          problemas: null,
          sugestao: 'Nada a ajustar.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
      if (output.includes(frase) && firstNumber !== null) {
        return {
          correto: false,
          pontuacao: 0,
          resumo: 'A saída mostra a frase, mas o número está errado.',
          o_que_fez_bem: 'A frase correta está presente.',
          problemas: 'Número não corresponde à quantidade de palavras.',
          sugestao: 'Conte as palavras usando split ou outra técnica.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
    }
  }

  if (/cada caractere|cada caracter|imprima cada caractere/.test(lower)) {
    if (isSingleCharArray(output)) {
      return {
        correto: true,
        pontuacao: 100,
        resumo: 'Saída correta: cada caractere está sendo impresso separadamente.',
        o_que_fez_bem: 'Usou split para quebrar a string em caracteres.',
        problemas: null,
        sugestao: 'Nada a ajustar.',
        codigo_exemplo: '',
        solucoes_alternativas: [],
        conceitos_usados: []
      };
    }
    const linhas = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (linhas.length > 1 && linhas.every(l => l.length === 1)) {
      return {
        correto: true,
        pontuacao: 100,
        resumo: 'Saída correta: cada caractere foi impresso em linha separada.',
        o_que_fez_bem: 'Imprime cada caractere individualmente.',
        problemas: null,
        sugestao: 'Nada a ajustar.',
        codigo_exemplo: '',
        solucoes_alternativas: [],
        conceitos_usados: []
      };
    }
    // Se pediu "cada caractere" mas recebeu array com espaços ou palavras
    if (output.startsWith('[') && (output.includes(' ') || output.includes(','))) {
      const arr = parseArrayLike(output);
      if (arr && arr.some(item => String(item).length > 1)) {
        return {
          correto: false,
          pontuacao: 0,
          resumo: 'A saída não está imprimindo cada caractere individualmente.',
          o_que_fez_bem: 'Usou split, mas não separou os caracteres corretamente.',
          problemas: 'Cada elemento da saída deve ser um único caractere.',
          sugestao: 'Use split("") para separar cada caractere.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
    }
  }

  // HEURÍSTICA 3: Soma de números
  if (/(soma|somar|adição|some|some os números)/.test(lower)) {
    const numbers = enunciado.match(/\d+/g);
    const rangeMatch = lower.match(/(?:de\s+)?(\d+)\s*(?:a|até)\s*(\d+)/);
    let expectedSum = null;

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const step = start <= end ? 1 : -1;
      expectedSum = Array.from({ length: Math.abs(end - start) + 1 }, (_, i) => start + i * step).reduce((a, b) => a + b, 0);
    } else if (numbers && numbers.length >= 2) {
      expectedSum = numbers.reduce((a, b) => Number(a) + Number(b), 0);
    }

    const outputNumber = extractNumber(output);
    console.log(`[HEURISTICA] Soma ativada: enunciado='${enunciado}', esperado=${expectedSum}, saida=${outputNumber}`);
    if (expectedSum !== null && outputNumber === expectedSum) {
      return {
        correto: true,
        pontuacao: 100,
        resumo: 'Soma correta dos números especificados.',
        o_que_fez_bem: 'Calculou a soma corretamente.',
        problemas: null,
        sugestao: 'Nada a ajustar.',
        codigo_exemplo: '',
        solucoes_alternativas: [],
        conceitos_usados: []
      };
    } else if (outputNumber !== null && expectedSum !== null) {
      return {
        correto: false,
        pontuacao: 0,
        resumo: 'Soma incorreta dos números.',
        o_que_fez_bem: 'Executou operação aritmética.',
        problemas: `Resultado ${outputNumber} não corresponde à soma esperada ${expectedSum}.`,
        sugestao: 'Verifique os números e a operação de soma.',
        codigo_exemplo: '',
        solucoes_alternativas: [],
        conceitos_usados: []
      };
    }
  }

  if (/vogais?/.test(lower) && /['"]([^'"]+)['"]/.test(enunciado)) {
    const quoted = extractQuotedText(enunciado);
    const outputNumber = extractNumber(output);
    if (quoted && outputNumber !== null) {
      const vowelCount = String(quoted).match(/[aeiouáéíóúâêîôûãõàèìòù]/gi)?.length || 0;
      if (outputNumber === vowelCount) {
        return makeResult({
          correto: true,
          pontuacao: 100,
          resumo: 'Contagem de vogais correta.',
          o_que_fez_bem: 'Calculou o número de vogais corretamente.',
          problemas: null,
          sugestao: 'Nada a ajustar.'
        });
      }
      return makeResult({
        correto: false,
        pontuacao: 0,
        resumo: 'A contagem de vogais está incorreta.',
        o_que_fez_bem: 'Tentou contar vogais.',
        problemas: `O valor ${outputNumber} não corresponde ao número de vogais em '${quoted}'.`,
        sugestao: 'Verifique quais letras são vogais e conte-as corretamente.'
      });
    }
  }

  if (/join\(\)/.test(lower)) {
    const items = parseQuotedArray(enunciado);
    if (Array.isArray(items) && items.length > 0) {
      const expected = items.join('');
      if (output === expected) {
        return makeResult({
          correto: true,
          pontuacao: 100,
          resumo: 'Uso correto de join() no array.',
          o_que_fez_bem: 'Transformou o array em string usando join().',
          problemas: null,
          sugestao: 'Nada a ajustar.'
        });
      }
      return makeResult({
        correto: false,
        pontuacao: 0,
        resumo: 'O resultado de join() está incorreto.',
        o_que_fez_bem: 'Tentou unir os itens do array.',
        problemas: `O valor esperado era '${expected}', mas a saída foi '${output}'.`,
        sugestao: 'Verifique o separador usado em join() e a ordem dos elementos.'
      });
    }
  }

  // HEURÍSTICA 4: Comprimento de string/array
  if (/(comprimento|tamanho|length|quantidade de elementos|comprimento da string)/.test(lower)) {
    const quoted = extractQuotedText(enunciado);
    if (quoted) {
      const expectedLength = quoted.length;
      const outputNumber = Number(output.match(/\d+/)?.[0]);
      if (outputNumber === expectedLength) {
        return {
          correto: true,
          pontuacao: 100,
          resumo: 'Comprimento correto da string.',
          o_que_fez_bem: 'Calculou o comprimento corretamente.',
          problemas: null,
          sugestao: 'Nada a ajustar.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
    }
  }

  // HEURÍSTICA 5: Verificar uso de toString() e typeof
  if (/tostring\(\)|\.tostring/.test(lower)) {
    const objectString = lines[0] || '';
    const typeLine = lines[1] || lines[lines.length - 1] || '';
    if (/\[object Object\]/i.test(objectString) && /string/i.test(typeLine)) {
      return makeResult({
        correto: true,
        pontuacao: 100,
        resumo: 'Uso correto de toString() em objeto e tipo string confirmado.',
        o_que_fez_bem: 'Imprimiu [object Object] e verificou typeof como string.',
        problemas: null,
        sugestao: 'Nada a ajustar.'
      });
    }
  }

  if (/typeof/.test(lower) && /string|number|boolean|object|array/.test(lower)) {
    const expectedType = lower.match(/string|number|boolean|object|array/)[0];
    const outputType = output.toLowerCase().includes('string') ? 'string'
      : output.toLowerCase().includes('number') ? 'number'
      : output.toLowerCase().includes('boolean') ? 'boolean'
      : output.toLowerCase().includes('object') ? 'object'
      : output.toLowerCase().includes('array') ? 'array'
      : null;
    if (outputType === expectedType) {
      return makeResult({
        correto: true,
        pontuacao: 100,
        resumo: 'Tipo esperado identificado corretamente.',
        o_que_fez_bem: 'Verificou o tipo com typeof e imprimiu o resultado correto.',
        problemas: null,
        sugestao: 'Nada a ajustar.'
      });
    }
  }

  if (/(contém|contains|inclui)/.test(lower) && /['"]([^'"]+)['"]/.test(enunciado)) {
    const substrings = enunciado.match(/['"]([^'"]+)['"]/g);
    if (substrings && substrings.length >= 2) {
      const mainString = substrings[0].slice(1, -1);
      const searchString = substrings[1].slice(1, -1);
      const expected = mainString.includes(searchString);
      const outputBool = extractBoolean(output);
      if (outputBool === expected) {
        return {
          correto: true,
          pontuacao: 100,
          resumo: 'Verificação correta de substring.',
          o_que_fez_bem: 'Verificou corretamente se a string contém a substring.',
          problemas: null,
          sugestao: 'Nada a ajustar.',
          codigo_exemplo: '',
          solucoes_alternativas: [],
          conceitos_usados: []
        };
      }
    }
  }

  return null;
}

function tryJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function parseJSON(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  
  const originalText = String(text);
  const candidates = [];
  
  // Estratégia 0: Remover code fences externas e limpar backticks soltos
  let cleaned = originalText.trim();
  cleaned = cleaned.replace(/^```(?:json|javascript)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  
  // Estratégia 1: Encontrar o primeiro { e último } com contagem de profundidade
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end !== -1) {
      const jsonStr = cleaned.substring(firstBrace, end);
      candidates.push({ source: 'brace-matching', text: jsonStr });
    }
  }
  
  // Estratégia 2: Extrair entre code fences (caso haja)
  const fenceRegex = /```(?:json|javascript)?\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = fenceRegex.exec(originalText)) !== null) {
    const content = match[1].trim();
    if (content && content.includes('{')) {
      candidates.push({ source: 'fence', text: content });
    }
  }
  
  // Estratégia 3: Encontrar objetos JSON entre chaves
  const objects = findJSONObjects(cleaned);
  for (const obj of objects) {
    candidates.push({ source: 'braces-find', text: obj.trim() });
  }
  
  // Estratégia 4: Todo o texto limpo
  candidates.push({ source: 'full-cleaned', text: cleaned.trim() });
  
  // Tentar parsear cada candidato
  for (const candidate of candidates) {
    // Tenta direto (pode ser JSON válido)
    const direct = tryJSONParse(candidate.text);
    if (direct !== null) {
      console.log(`[JSON] ✓ parseado com sucesso (fonte: ${candidate.source}, tamanho: ${candidate.text.length})`);
      return direct;
    }
    
    // Tenta normalizar e depois parsear
    const normalized = normalizeLooseJSON(candidate.text);
    const parsed = tryJSONParse(normalized);
    if (parsed !== null) {
      console.log(`[JSON] ✓ parseado após normalização (fonte: ${candidate.source})`);
      return parsed;
    }
  }
  
  // Se tudo falhar, tenta estratégia agressiva: limpar backticks dentro do JSON
  const aggressiveCleaned = cleaned.replace(/`([^`]*)`/g, '"$1"');
  const directAggressive = tryJSONParse(aggressiveCleaned);
  if (directAggressive !== null) {
    console.log(`[JSON] ✓ parseado com limpeza agressiva de backticks`);
    return directAggressive;
  }
  
  // Se tudo falhar, loga diagnóstico
  console.error('[JSON] ✗ Nenhum candidato funcionou. Diagnóstico:');
  console.error(`  - Texto original tamanho: ${originalText.length}`);
  console.error(`  - Primeiros 800 chars: ${originalText.slice(0, 800).replace(/\n/g, '\\n')}`);
  console.error(`  - Candidatos testados: ${candidates.length}`);
  console.error(`  - Cleaned text (primeiros 500): ${cleaned.slice(0, 500).replace(/\n/g, '\\n')}`);
  
  return null;
}

// ── SYSTEM PROMPTS ─────────────────────────────────────────────────────────────
const SYS_PROFESSOR = `Você é um professor especialista em JavaScript que cria exercícios práticos e didáticos.
Você sempre responde em português brasileiro.
Quando solicitado a gerar questões, você cria desafios reais e concretos de programação, não questões teóricas.
Suas questões sempre pedem que o aluno escreva código JavaScript funcional.`;

const SYS_VERIFICADOR = `Você é um avaliador especialista em JavaScript que valida com base no RESULTADO, não na estrutura.

REGRA FUNDAMENTAL: Se o código produz o resultado correto, ele está CORRETO — independente da abordagem, estrutura ou estilo.
- Aceite loops FOR, WHILE, recursão, métodos funcionais — qualquer abordagem válida
- Se o resultado final atende ao pedido, marque como correto: true
- NÃO penalize por usar abordagem diferente da esperada
- NÃO penalize por código mais verboso ou mais conciso que o esperado
- Só marque como incorreto se o resultado REAL estiver errado

Você responde sempre em português brasileiro com feedback detalhado e construtivo.
Quando correto, sempre mostre 2-3 formas alternativas de resolver o mesmo problema.`;

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

// POST /gerar-questao
function gerarQuestao(topico, nivel, historico, callback) {
  const historicoStr = historico.length > 0
    ? `\n\nQuestões já feitas nesta sessão (NÃO repita):\n${historico.slice(-10).map((q,i) => `${i+1}. ${q}`).join('\n')}`
    : '';

  const prompt = `Gere UMA questão prática de JavaScript sobre o tópico: "${topico}"
Nível de dificuldade: ${nivel}
${historicoStr}

REGRAS IMPORTANTES:
- A questão deve pedir que o aluno ESCREVA CÓDIGO JavaScript funcional
- Seja específico: dê exemplos de entrada e saída esperada
- Fácil: conceitos básicos, 1-5 linhas de código
- Médio: lógica moderada, uso de métodos, 5-15 linhas
- Difícil: algoritmos, composição de conceitos, 15+ linhas
- NUNCA faça questões teóricas de múltipla escolha
- NUNCA repita questões já feitas
- Seja criativo e varie os tipos de problema

Responda APENAS com um objeto JSON válido neste formato exato:
{
  "enunciado": "Texto completo da questão com exemplos de entrada/saída",
  "exemplo": "Exemplo claro: nomeFuncao(entrada) → saída esperada",
  "dica_inicial": "Uma dica sutil sem revelar a solução",
  "conceitos": ["conceito1", "conceito2"],
  "nivel_detectado": "facil|medio|dificil",
  "funcao_esperada": "nome da função principal esperada (se aplicável)"
}`;

  ollama(SYS_PROFESSOR, prompt, (text, err) => {
    if (err) return callback(null, err);
    const json = parseJSON(text);
    if (!json) return callback(null, 'A IA não retornou um formato válido. Tente novamente.');
    callback(json, null);
  });
}

// POST /verificar
function verificarResposta(enunciado, codigoAluno, topico, contextoExecucao, callback) {
  // Primeiro: executar o código para capturar a saída real
  executarCodigoAluno(codigoAluno).then(async execResult => {
    const saidaReal = execResult.saida || '(sem saída)';
    const erroMsg = execResult.erro ? `Erro: ${execResult.erro}` : '';
    const temSaida = String(saidaReal).trim().length > 0;
    const temErro = !execResult.sucesso || Boolean(erroMsg);

    if (temErro) {
      const resultado = {
        correto: false,
        pontuacao: 0,
        resumo: 'Código tem erro de sintaxe ou execução',
        o_que_fez_bem: 'Código foi executado',
        problemas: erroMsg || 'Erro de execução',
        sugestao: 'Corrija a sintaxe ou lógica do código',
        codigo_exemplo: codigoAluno,
        solucoes_alternativas: [],
        conceitos_usados: []
      };
      return callback(resultado, null);
    }

    if (!temSaida) {
      const resultado = {
        correto: false,
        pontuacao: 0,
        resumo: 'Código não produz saída',
        o_que_fez_bem: 'Código foi executado sem erros',
        problemas: 'Não houve saída visível no console',
        sugestao: 'Use console.log para imprimir o resultado solicitado',
        codigo_exemplo: codigoAluno,
        solucoes_alternativas: [],
        conceitos_usados: []
      };
      return callback(resultado, null);
    }

    const heuristic = heuristicCheck(enunciado, saidaReal);
    if (heuristic) {
      return callback(heuristic, null);
    }

    const prompt = `Você é um avaliador de exercícios de programação em JavaScript.
Você deve validar apenas o resultado produzido pelo código, não a implementação.

Enunciado da questão:
${enunciado}

Saída produzida pelo código:
"""
${saidaReal}
"""

Responda apenas com um objeto JSON válido no formato abaixo, sem texto adicional:
{
  "correto": true|false,
  "pontuacao": 100|0,
  "resumo": "Resumo breve do motivo da avaliação",
  "o_que_fez_bem": "O que o código acertou",
  "problemas": "O que está errado ou faltando",
  "sugestao": "Sugestão prática para corrigir"
}

Critérios:
- Marque como correto apenas se a saída resolver o enunciado com precisão.
- Se a saída não atender ao pedido do enunciado, marque como incorreto.
- Não use a estrutura de objeto JavaScript, apenas JSON válido.
`;

    console.log('[VERIFICAR] enviando para ollama - saída real capturada:');
    console.log('[VERIFICAR] Saída:', saidaReal.substring(0, 200));

    try {
      const text = await getVerifierResponse(SYS_VERIFICADOR, prompt, MAX_RETRIES);
      console.log('[VERIFICAR] resposta bruta tamanho:', String(text).length);
      let json = parseVerifierResponse(text);

      if (!json || typeof json.correto === 'undefined') {
        console.error('[VERIFICAR] parseJSON falhou. Tentando extração simples de termo.');
        const lower = String(text).toLowerCase();
        const temCorreto = /\bcorreto\b/.test(lower);
        const temIncorreto = /\bincorreto\b/.test(lower);

        if (temCorreto && !temIncorreto) {
          json = {
            correto: true,
            pontuacao: 100,
            resumo: 'Resposta avaliada como correta pelo verificador automático',
            o_que_fez_bem: 'A saída parece atender ao enunciado',
            problemas: null,
            sugestao: 'Nenhuma correção necessária',
            codigo_exemplo: codigoAluno,
            solucoes_alternativas: [],
            conceitos_usados: []
          };
        } else if (temIncorreto && !temCorreto) {
          json = {
            correto: false,
            pontuacao: 0,
            resumo: 'Resposta avaliada como incorreta pelo verificador automático',
            o_que_fez_bem: 'Código foi executado sem erros',
            problemas: 'A saída não atende ao enunciado',
            sugestao: 'Ajuste o código para atender ao enunciado',
            codigo_exemplo: codigoAluno,
            solucoes_alternativas: [],
            conceitos_usados: []
          };
        }
      }

      if (!json || typeof json.correto === 'undefined') {
        console.error('[VERIFICAR] não foi possível obter JSON útil da resposta do verificador.');
        const fallback = {
          correto: false,
          pontuacao: 0,
          resumo: 'Não foi possível interpretar a resposta do avaliador automático.',
          o_que_fez_bem: 'Código foi executado sem erros',
          problemas: 'Resposta do verificador não estava em JSON válido',
          sugestao: 'Reinicie o serviço Ollama ou revise o prompt',
          codigo_exemplo: codigoAluno,
          solucoes_alternativas: [],
          conceitos_usados: []
        };
        return callback(fallback, null);
      }

      const resultado = {
        correto: json.correto === true || json.correto === 'true',
        pontuacao: typeof json.pontuacao === 'number' ? json.pontuacao : (json.correto === true || json.correto === 'true' ? 100 : 0),
        resumo: json.resumo || 'Avaliação concluída pelo verificador automático',
        o_que_fez_bem: json.o_que_fez_bem || 'Código foi executado sem erros',
        problemas: json.problemas || null,
        sugestao: json.sugestao || (json.correto ? 'Está correto.' : 'Ajuste o código para atender ao enunciado.'),
        codigo_exemplo: json.codigo_exemplo || codigoAluno,
        solucoes_alternativas: json.solucoes_alternativas || [],
        conceitos_usados: json.conceitos_usados || []
      };

      callback(resultado, null);
    } catch (err) {
      console.error('[VERIFICAR] erro ao obter resposta do verificador após tentativas:', err);
      const fallbackErr = {
        correto: false,
        pontuacao: 0,
        resumo: 'Não foi possível avaliar automaticamente. Erro na IA.',
        o_que_fez_bem: 'Código foi executado sem erros',
        problemas: String(err),
        sugestao: 'Tente novamente em alguns instantes ou reinicie o serviço Ollama',
        codigo_exemplo: codigoAluno,
        solucoes_alternativas: [],
        conceitos_usados: []
      };
      return callback(fallbackErr, null);
    }
  }).catch(err => {
    console.error('[VERIFICAR] erro ao executar código:', err);
    const fallback = {
      correto: false,
      pontuacao: 0,
      resumo: 'Erro ao executar o código',
      o_que_fez_bem: 'Código foi recebido',
      problemas: err.message || String(err),
      sugestao: 'Verifique a sintaxe do código',
      codigo_exemplo: '',
      solucoes_alternativas: [],
      conceitos_usados: []
    };
    callback(fallback, null);
  });
}

// POST /dica
function pedirDica(enunciado, codigoAtual, tentativas, callback) {
  const nivelDica = tentativas <= 1 ? 'sutil' : tentativas <= 3 ? 'moderada' : 'detalhada';
  const prompt = `Questão: ${enunciado}

Código atual do aluno (pode estar incompleto):
\`\`\`javascript
${codigoAtual || '(ainda não escreveu nada)'}
\`\`\`

Tentativas até agora: ${tentativas}
Nível da dica: ${nivelDica}

Dê uma dica ${nivelDica} em português. 
- Sutil: aponte apenas a direção geral
- Moderada: mencione qual método/conceito usar
- Detalhada: mostre a estrutura mas sem a solução completa

Responda diretamente com a dica em texto, sem JSON.`;

  ollama(SYS_PROFESSOR, prompt, callback);
}

function gerarEstudo(topico, callback) {
  const prompt = `Você é um professor especialista em JavaScript. Explique o tópico "${topico}" para um estudante que quer entender bem o conceito.

- Dê uma explicação clara em português.
- Inclua exemplos simples em JavaScript.
- Use formatação de texto com parágrafos e trechos de código.
- Não responda em JSON, responda apenas com texto formatado.`;
  ollama(SYS_PROFESSOR, prompt, (text, err) => {
    if (err) return callback(null, err);
    callback(text, null);
  });
}

function gerarExemplos(topico, callback) {
  const prompt = `Você é um professor especialista em JavaScript. Para o tópico "${topico}", forneça 2 ou 3 exemplos práticos em JavaScript.

- Inclua um pequeno enunciado para cada exemplo.
- Mostre o código e o resultado esperado.
- Use texto em português e código JavaScript claro.
- Não responda em JSON, responda apenas com texto formatado.`;
  ollama(SYS_PROFESSOR, prompt, (text, err) => {
    if (err) return callback(null, err);
    callback(text, null);
  });
}

function perguntarEstudo(topico, pergunta, historico, callback) {
  const memo = historico && historico.length ? `Histórico de conversa:
${historico.map((m, i) => `${i + 1}. ${m.role}: ${m.content}`).join('\n')}

` : '';
  const prompt = `${memo}Você é um assistente de estudos em JavaScript. Responda à pergunta do usuário sobre o tópico "${topico}" de forma clara e didática.

Pergunta:
${pergunta}

Responda em português, com explicações e exemplos quando necessário.`;
  ollama(SYS_PROFESSOR, prompt, (text, err) => {
    if (err) return callback(null, err);
    callback(text, null);
  });
}

// ── SERVIDOR HTTP ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const sendJSON = (code, obj) => {
    try {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    } catch (e) {
      log('error', 'Erro ao enviar resposta JSON', { error: e.message, code });
      res.writeHead(500);
      res.end('{"error":"Erro interno do servidor"}');
    }
  };

  const parseBody = (cb) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Proteção contra payload muito grande
      if (body.length > 50000) {
        res.writeHead(413);
        res.end('{"error":"Payload muito grande"}');
        req.destroy();
        return;
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        cb(parsed);
      } catch(e) {
        log('warn', 'JSON inválido recebido', { body: body.slice(0, 200) });
        sendJSON(400, { error: 'JSON inválido.' });
      }
    });
    req.on('error', (err) => {
      log('error', 'Erro ao ler body', { error: err.message });
      sendJSON(400, { error: 'Erro ao processar requisição.' });
    });
  };

  // Tratamento de erro global
  try {
    // ── POST /gerar-questao ──
    if (req.method === 'POST' && req.url === '/gerar-questao') {
      parseBody((body) => {
        try {
          const topico = validateString(body.topico, 'Tópico', 200);
          const nivel = body.nivel || 'médio';
          const historico = validateArray(body.historico || [], 'Histórico', 50);

          gerarQuestao(topico, nivel, historico, (result, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, result);
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── POST /verificar ──
    if (req.method === 'POST' && req.url === '/verificar') {
      parseBody((body) => {
        try {
          const enunciado = validateString(body.enunciado, 'Enunciado', 2000);
          const codigo = validateString(body.codigo, 'Código', 5000);
          const topico = body.topico ? validateString(body.topico, 'Tópico', 200) : 'JavaScript';
          const contexto_execucao = body.contexto_execucao || null;

          verificarResposta(enunciado, codigo, topico, contexto_execucao, (result, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, result);
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── GET /health ──
    if (req.method === 'GET' && req.url === '/health') {
      return sendJSON(200, { status: 'ok', message: 'Servidor funcionando' });
    }

    // ── POST /dica ──
    if (req.method === 'POST' && req.url === '/dica') {
      parseBody((body) => {
        try {
          const enunciado = validateString(body.enunciado, 'Enunciado', 2000);
          const codigo = validateString(body.codigo || '', 'Código', 5000);
          const tentativas = typeof body.tentativas === 'number' ? body.tentativas : 0;

          pedirDica(enunciado, codigo, tentativas, (text, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, { dica: text });
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── POST /estudo ──
    if (req.method === 'POST' && req.url === '/estudo') {
      parseBody((body) => {
        try {
          const topico = validateString(body.topico, 'Tópico', 200);

          gerarEstudo(topico, (text, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, { conteudo: text });
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── POST /exemplos ──
    if (req.method === 'POST' && req.url === '/exemplos') {
      parseBody((body) => {
        try {
          const topico = validateString(body.topico, 'Tópico', 200);

          gerarExemplos(topico, (text, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, { conteudo: text });
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── POST /perguntar ──
    if (req.method === 'POST' && req.url === '/perguntar') {
      parseBody((body) => {
        try {
          const topico = validateString(body.topico, 'Tópico', 200);
          const pergunta = validateString(body.pergunta, 'Pergunta', 1000);
          const historico = validateArray(body.historico || [], 'Histórico', 20);

          perguntarEstudo(topico, pergunta, historico, (text, err) => {
            if (err) return sendJSON(500, { error: err });
            sendJSON(200, { resposta: text });
          });
        } catch (e) {
          sendJSON(400, { error: e.message });
        }
      });
      return;
    }

    // ── Arquivos estáticos ──
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, 'public', filePath);

    // Validação de path para prevenir directory traversal
    if (filePath.includes('..') || !filePath.startsWith(path.join(__dirname, 'public'))) {
      return sendJSON(403, { error: 'Acesso negado' });
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          return res.end('Não encontrado');
        }
        log('error', 'Erro ao ler arquivo', { error: err.message, filePath });
        return sendJSON(500, { error: 'Erro interno' });
      }
      const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });

  } catch (error) {
    log('error', 'Erro não tratado no servidor', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    });
    sendJSON(500, { error: 'Erro interno do servidor' });
  }
});

server.listen(PORT, () => {
  log('info', 'Servidor iniciado', { port: PORT, model: OLLAMA_MODEL });
  console.log('');
  console.log('  📚  JS Master AI rodando!');
  console.log('  🤖  Modelo: ' + OLLAMA_MODEL);
  console.log('  🔌  Porta:  ' + PORT);
  console.log('');
  console.log('  Acesse:  http://localhost:' + PORT);
  console.log('');
  console.log('  Pressione Ctrl+C para parar.');
  console.log('');
});

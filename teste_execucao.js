const vm = require('vm');

// Teste direto da função executarCodigoAluno
function executarCodigoAluno(codigoAluno, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      // Context com console.log capturado
      const outputs = [];
      const sandbox = {
        console: {
          log: (...args) => outputs.push(args.map(arg => {
            if (typeof arg === 'object') return JSON.stringify(arg);
            return String(arg);
          }).join(' ')),
          error: (...args) => outputs.push('[ERROR] ' + args.map(arg => String(arg)).join(' ')),
          warn: (...args) => outputs.push('[WARN] ' + args.map(arg => String(arg)).join(' ')),
        },
        // Funções globais comuns
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
          saida: '[TIMEOUT] O código excedeu 5 segundos de execução',
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

// Testes
const testes = [
  {
    nome: "Código correto",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase)
console.log(frase.split(" ").length)`
  },
  {
    nome: "Código com erro de sintaxe",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase
console.log(frase.split(" ").length)`
  }
];

async function testar() {
  for (const teste of testes) {
    console.log(`\n🧪 Testando: ${teste.nome}`);
    console.log(`💻 Código: ${teste.codigo.replace(/\n/g, ' | ')}`);

    try {
      const result = await executarCodigoAluno(teste.codigo);
      console.log(`✅ Sucesso: ${result.sucesso}`);
      console.log(`📤 Saída: "${result.saida}"`);
      if (result.erro) console.log(`❌ Erro: ${result.erro}`);
    } catch (err) {
      console.log(`💥 Erro crítico: ${err.message}`);
    }
  }
}

testar();
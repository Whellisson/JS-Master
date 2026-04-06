const http = require('http');

// Testes para verificar se o sistema está funcionando corretamente
const testes = [
  {
    nome: "Código correto - contar palavras",
    enunciado: "Escreva um código que receba a frase 'O homem andava pelo parque' e mostre quantas palavras ela tem.",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase)
console.log(frase.split(" ").length)`,
    esperado: "correto"
  },
  {
    nome: "Código errado - conta caracteres ao invés de palavras",
    enunciado: "Escreva um código que receba a frase 'O homem andava pelo parque' e mostre quantas palavras ela tem.",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase)
console.log(frase.length)`,
    esperado: "incorreto"
  },
  {
    nome: "Código correto - conta palavras e mostra apenas o número",
    enunciado: "Escreva um código que receba a frase 'O homem andava pelo parque' e mostre quantas palavras ela tem.",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase.split(" ").length)`,
    esperado: "correto"
  },
  {
    nome: "Código errado - sintaxe inválida",
    enunciado: "Escreva um código que receba a frase 'O homem andava pelo parque' e mostre quantas palavras ela tem.",
    codigo: `const frase = "O homem andava pelo parque"
console.log(frase
console.log(frase.split(" ").length)`,
    esperado: "incorreto"
  },
  {
    nome: "Código correto - split caractere por caractere",
    enunciado: "Peça para a aluna usar o método split() em uma string. Peça que ela imprima cada caractere da string.",
    codigo: `const frase = "Olá mundo!"
console.log(frase.split(""))`,
    esperado: "correto"
  },
  {
    nome: "Código errado - split por espaço em vez de caractere",
    enunciado: "Use o método split() para separar cada caractere individual da string 'Olá mundo!' e imprima cada um.",
    codigo: `const frase = "Olá mundo!"
console.log(frase.split(" "))`,
    esperado: "incorreto"
  },
  {
    nome: "Código correto - soma de números",
    enunciado: "Some os números 5 e 3 e imprima o resultado.",
    codigo: `console.log(5 + 3)`,
    esperado: "correto"
  },
  {
    nome: "Código errado - soma incorreta",
    enunciado: "Some os números 5 e 3 e imprima o resultado.",
    codigo: `console.log(5 + 4)`,
    esperado: "incorreto"
  },
  {
    nome: "Código correto - comprimento de string",
    enunciado: "Mostre o comprimento da string 'JavaScript'.",
    codigo: `console.log("JavaScript".length)`,
    esperado: "correto"
  },
  {
    nome: "Código correto - toString em objeto e tipo string",
    enunciado: "Peça para a aluna usar o método toString() em um objeto e verifique se ele retorna um valor de string ou outro tipo. Como exemplo, considere objeto { nome: 'João' }.",
    codigo: `const pessoa = { nome: 'João' };
const resultado = pessoa.toString();
console.log(resultado);
console.log(typeof resultado);`,
    esperado: "correto"
  },
  {
    nome: "Código correto - loop for soma 1 a 5",
    enunciado: "Usando um loop for, some os números de 1 a 5 e imprima o total.",
    codigo: `let soma = 0;
for (let i = 1; i <= 5; i++) {
  soma += i;
}
console.log(soma);`,
    esperado: "correto"
  },
  {
    nome: "Código correto - conta vogais",
    enunciado: "Escreva um código que conte quantas vogais existem na string 'Abacaxi' e imprima o número.",
    codigo: `const texto = 'Abacaxi';
const vogais = texto.match(/[aeiou]/gi) || [];
console.log(vogais.length);`,
    esperado: "correto"
  },
  {
    nome: "Código correto - join array",
    enunciado: "Use join() para transformar o array ['O','i'] em 'Oi' e imprima o resultado.",
    codigo: `console.log(['O','i'].join(''));`,
    esperado: "correto"
  },
  {
    nome: "Código correto - verificar substring",
    enunciado: "Verifique se a string 'Olá mundo' contém 'mundo' e imprima true ou false.",
    codigo: `console.log("Olá mundo".includes("mundo"))`,
    esperado: "correto"
  }
];

function testarVerificacao(enunciado, codigo, callback) {
  const postData = JSON.stringify({
    enunciado: enunciado,
    codigo: codigo,
    topico: "JavaScript"
  });

  const options = {
    hostname: 'localhost',
    port: 3002,
    path: '/verificar',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        callback(result);
      } catch (e) {
        callback({ error: 'Erro ao parsear resposta', raw: data });
      }
    });
  });

  req.on('error', (err) => {
    callback({ error: 'Erro na requisição', details: err.message });
  });

  req.write(postData);
  req.end();
}

console.log('🚀 Iniciando testes de validação...\n');

let testeAtual = 0;

function executarProximoTeste() {
  if (testeAtual >= testes.length) {
    console.log('\n✅ Todos os testes foram executados!');
    return;
  }

  const teste = testes[testeAtual];
  console.log(`📋 Teste ${testeAtual + 1}/${testes.length}: ${teste.nome}`);
  console.log(`📝 Enunciado: ${teste.enunciado}`);
  console.log(`💻 Código: ${teste.codigo.replace(/\n/g, ' | ')}`);
  console.log(`🎯 Esperado: ${teste.esperado.toUpperCase()}`);

  testarVerificacao(teste.enunciado, teste.codigo, (resultado) => {
    if (resultado.error) {
      console.log(`❌ ERRO: ${resultado.error}`);
      if (resultado.raw) console.log(`   Raw: ${resultado.raw.substring(0, 200)}`);
    } else {
      const correto = resultado.correto ? 'CORRETO' : 'INCORRETO';
      const match = (resultado.correto && teste.esperado === 'correto') ||
                   (!resultado.correto && teste.esperado === 'incorreto');

      console.log(`🤖 Sistema disse: ${correto}`);
      console.log(`📊 Pontuação: ${resultado.pontuacao}`);
      console.log(`💬 Resumo: ${resultado.resumo}`);

      if (match) {
        console.log(`✅ TESTE PASSOU`);
      } else {
        console.log(`❌ TESTE FALHOU - Esperava ${teste.esperado.toUpperCase()} mas recebeu ${correto}`);
      }
    }

    console.log('─'.repeat(80));
    testeAtual++;
    setTimeout(executarProximoTeste, 1000); // Espera 1 segundo entre testes
  });
}

// Aguardar um pouco para o servidor iniciar
setTimeout(() => {
  executarProximoTeste();
}, 2000);
const http = require('http');

// Teste simples para verificar execução de código
const testeSimples = {
  enunciado: "Escreva um código que receba a frase 'O homem andava pelo parque' e mostre quantas palavras ela tem.",
  codigo: `const frase = "O homem andava pelo parque"
console.log(frase)
console.log(frase.split(" ").length)`
};

function testarExecucao(codigo, callback) {
  const postData = JSON.stringify({
    enunciado: testeSimples.enunciado,
    codigo: codigo,
    topico: "JavaScript"
  });

  console.log('📤 Dados sendo enviados:');
  console.log('Enunciado:', testeSimples.enunciado);
  console.log('Código (raw):', JSON.stringify(codigo));
  console.log('Código (visual):', codigo.replace(/\n/g, '\\n'));
  console.log('PostData length:', postData.length);

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

console.log('🔍 Teste de execução simples...');
console.log('Código original:', testeSimples.codigo.replace(/\n/g, ' | '));

testarExecucao(testeSimples.codigo, (resultado) => {
  if (resultado.error) {
    console.log('❌ Erro:', resultado.error);
    if (resultado.raw) console.log('Raw response:', resultado.raw);
  } else {
    console.log('✅ Resultado:', {
      correto: resultado.correto,
      pontuacao: resultado.pontuacao,
      resumo: resultado.resumo
    });
  }
});
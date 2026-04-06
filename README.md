# 🧠 JS Master AI

Plataforma interativa para praticar **JavaScript** com questões geradas por **Inteligência Artificial** (Ollama).

## 🚀 Pré-requisitos

- [Node.js](https://nodejs.org/) (v14+)
- [Ollama](https://ollama.ai/) instalado e rodando

## 📦 Instalação

```bash
# Clone o repositório
git clone https://github.com/Whellisson/JS-Master.git
cd "JS MASTER PRO V1"
```

## ▶️ Como usar

### 1. Iniciar o Ollama

Abra um terminal e execute:

```bash
ollama serve
```

> Certifique-se de ter um modelo instalado. O padrão usado é `qwen2.5:1.5b`.
> Para instalar outro modelo: `ollama pull <nome-do-modelo>`

### 2. Iniciar o servidor

Em outro terminal, na pasta do projeto:

```bash
node server.js
```

O servidor vai rodar em **`http://localhost:3002`**.

### 3. Acessar a aplicação

Abra no navegador: **http://localhost:3002**

## 🎮 Uso da aplicação

1. **Selecione um tópico** na barra lateral esquerda (ex: Variáveis, Funções, Loops)
2. **Escolha o nível** (Automático, Fácil, Médio ou Difícil)
3. Clique em **✨ Nova** para gerar uma questão com IA
4. **Escreva seu código** no editor
5. Clique em **✓ Verificar** (ou `Ctrl+Enter`) para enviar sua resposta
6. Receba **feedback detalhado** da IA sobre sua solução
7. Use **💡 Dica** se precisar de ajuda

### 📚 Módulo de Estudos

Clique em **📚 Estudos** para acessar o modo estudo com:
- Explicações detalhadas por tópico
- Exemplos práticos com código
- Chat com IA para tirar dúvidas

## 🛠️ Configuração

No arquivo `server.js`, você pode ajustar:

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | `3002` |
| `OLLAMA_MODEL` | Modelo da IA | `qwen2.5:1.5b` |
| `EXECUTION_TIMEOUT_MS` | Timeout de execução | `15000` |
| `OLLAMA_TIMEOUT_MS` | Timeout da IA | `180000` |

## 🔧 APIs disponíveis

| Endpoint | Método | Descrição |
|---|---|---|
| `/gerar-questao` | POST | Gera questão via IA |
| `/verificar` | POST | Verifica resposta do aluno |
| `/dica` | POST | Solicita dica progressiva |
| `/estudo` | POST | Gera explicação de tópico |
| `/exemplos` | POST | Gera exemplos práticos |
| `/perguntar` | POST | Chat livre com IA |
| `/health` | GET | Health check |

## 🗺️ Recursos

- Geração de questões com IA local (sem depender de APIs externas)
- Verificação inteligente de código com feedback detalhado
- Dicas adaptativas (ficam mais detalhadas a cada tentativa)
- Material de estudo gerado por IA
- Histórico de sessão e revisão de progresso
- Exportação de relatório em PDF e JSON
- Editor Monaco (mesmo engine do VS Code)
- Temas escuros com interface responsiva

## 👤 Autor

**Whellisson** — [GitHub](https://github.com/Whellisson)

## 📄 Licença

Este projeto é de uso educacional.

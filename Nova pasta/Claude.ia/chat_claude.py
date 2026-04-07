import json
import httpx
import sys

def load_settings():
    with open('Claude.ia/settings.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def chat_with_claude():
    settings = load_settings()
    base_url = settings['env']['ANTHROPIC_BASE_URL']
    token = settings['env']['ANTHROPIC_AUTH_TOKEN']
    model = settings['env']['ANTHROPIC_MODEL']

    url = f'{base_url}/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    print("Claude esta pronto! Digite sua mensagem (ou 'sair' para encerrar):")
    print("-" * 50)

    while True:
        try:
            user_input = input("\nVocê: ").strip()
            if user_input.lower() in ['sair', 'exit', 'quit']:
                print("Ate logo!")
                break

            if not user_input:
                continue

            payload = {
                'model': model,
                'messages': [{'role': 'user', 'content': user_input}],
                'max_tokens': 500,
            }

            print("Claude esta pensando...")
            response = httpx.post(url, json=payload, headers=headers, timeout=60.0)

            if response.status_code == 200:
                data = response.json()
                claude_response = data['choices'][0]['message']['content']
                print(f"\nClaude: {claude_response}")
            else:
                print(f"\nErro {response.status_code}: {response.text}")

        except KeyboardInterrupt:
            print("\nInterrompido pelo usuario. Ate logo!")
            break
        except Exception as e:
            print(f"\nErro: {e}")

if __name__ == "__main__":
    chat_with_claude()
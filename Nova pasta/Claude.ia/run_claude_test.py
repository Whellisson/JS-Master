import json
import httpx

with open('Claude.ia/settings.json', 'r', encoding='utf-8') as f:
    settings = json.load(f)

base_url = settings['env']['ANTHROPIC_BASE_URL']
token = settings['env']['ANTHROPIC_AUTH_TOKEN']
model = settings['env']['ANTHROPIC_MODEL']

url = f'{base_url}/v1/chat/completions'
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
}

payload = {
    'model': model,
    'messages': [
        {'role': 'user', 'content': 'Teste de conexão com o Claude.'}
    ],
    'max_tokens': 20,
}

response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
print('URL:', url)
print('status_code:', response.status_code)
print('content_type:', response.headers.get('content-type'))
print(response.text)
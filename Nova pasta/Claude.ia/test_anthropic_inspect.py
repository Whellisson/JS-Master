import inspect
import anthropic
from anthropic import Anthropic

print('anthropic file:', anthropic.__file__)
print('Anthropic init:', inspect.signature(Anthropic.__init__))
print('Anthropic attrs:', [a for a in dir(Anthropic) if a.startswith('complet') or a.startswith('completion') or a in ('client','base_url')])
print('anthropic module attrs sample:', [a for a in dir(anthropic) if a in ('Anthropic','Client')])

"""ask_claude talks to the Claude API with the same extraction prompt, and reads JSON out of the text reply."""
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import fi_llm  # noqa: E402


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class AskClaudeTest(unittest.TestCase):
    def test_request_and_reply(self):
        calls = []

        def post(url, **kwargs):
            calls.append((url, kwargs))
            return FakeResponse({'content': [{'type': 'text', 'text': 'Here it is: {"material": "Brass"}'}]})

        fake = types.ModuleType('requests')
        fake.post = post
        sys.modules['requests'] = fake
        try:
            answer = fi_llm.ask_claude('Material: Brass', 'test-key')
        finally:
            del sys.modules['requests']
        self.assertEqual(answer, {'material': 'Brass'})
        url, kwargs = calls[0]
        self.assertEqual(url, 'https://api.anthropic.com/v1/messages')
        self.assertEqual(kwargs['headers']['x-api-key'], 'test-key')
        self.assertEqual(kwargs['json']['model'], fi_llm.CLAUDE_MODEL)
        self.assertEqual(kwargs['json']['system'], fi_llm.SYSTEM)
        self.assertIn('Material: Brass', kwargs['json']['messages'][0]['content'])

    def test_no_json_gives_empty(self):
        fake = types.ModuleType('requests')
        fake.post = lambda url, **kwargs: FakeResponse({'content': [{'type': 'text', 'text': 'nothing here'}]})
        sys.modules['requests'] = fake
        try:
            self.assertEqual(fi_llm.ask_claude('text', 'k'), {})
        finally:
            del sys.modules['requests']


if __name__ == '__main__':
    unittest.main()

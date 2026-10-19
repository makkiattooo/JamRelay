import { expect, it } from 'vitest';
import { languages } from '../src/cli/i18n/index.js';
import { guidedTranslations } from '../src/cli/guided.js';

it('provides translated provider requirements and client instructions in all supported languages', () => {
  const { requirements, clientInstructions } = guidedTranslations;
  const providers = ['spotify', 'soundcloud', 'apple-music', 'youtube'] as const;
  const clients = ['chatgpt', 'claude', 'cursor', 'vscode', 'generic'] as const;
  for (const language of languages) {
    for (const provider of providers) {
      expect(requirements[language][provider].trim()).not.toBe('');
      if (language !== 'en')
        expect(requirements[language][provider]).not.toBe(requirements.en[provider]);
    }
    for (const client of clients) {
      expect(clientInstructions[language][client].trim()).not.toBe('');
      if (language !== 'en')
        expect(clientInstructions[language][client]).not.toBe(clientInstructions.en[client]);
    }
  }
});

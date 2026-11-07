import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequest, parseResult, solve } from '../solver.js';

const result = questions => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ questions }) }] } }] });
const question = { question: '2 + 2?', explanation: 'Adding gives four.', confidence: 'high', answers: [{ text: '4', box: [100, 200, 150, 350] }] };
test('request includes screenshot and constrains the answer schema', () => {
  const request = makeRequest('image-data');
  assert.equal(request.contents[0].parts[1].inlineData.data, 'image-data');
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.ok(request.systemInstruction.parts[0].text.includes('untrusted'));
});
test('accepts valid answers and refuses unsafe box coordinates', () => {
  assert.deepEqual(parseResult(result([question])), [question]);
  const invalid = [[-1, 0, 200, 200], [0, 0, 1001, 200], [100, 0, 50, 200], [0, 0, 20], [0, 0, 0, 20]];
  for (const box of invalid) assert.deepEqual(parseResult(result([{ ...question, answers: [{ text: '4', box }] }]))[0].answers, []);
});
test('refuses blocked, truncated, and malformed responses', () => {
  assert.throws(() => parseResult({ candidates: [] }));
  assert.throws(() => parseResult({ candidates: [{ finishReason: 'MAX_TOKENS' }] }));
  assert.throws(() => parseResult(result([{ ...question, confidence: 'certain' }])));
});
test('supports no question and unanswered questions', () => {
  assert.deepEqual(parseResult(result([])), []);
  assert.deepEqual(parseResult(result([{ ...question, answers: [] }]))[0].answers, []);
});
test('rejects an option list passed off as answers to a single-answer question', () => {
  const answers = Array.from({ length: 4 }, (_, i) => ({ text: `Option ${i}`, box: [i * 100, 0, i * 100 + 50, 500] }));
  assert.throws(() => parseResult(result([{ ...question, answers }])), /multiple options/);
  assert.throws(() => parseResult(result([{ ...question, selectionMode: 'multiple', answers }])), /multiple options/);
  assert.equal(parseResult(result([{ ...question, question: 'Select all that apply: which are prime?', selectionMode: 'multiple', answers: answers.slice(0, 2) }]))[0].answers.length, 2);
});
test('quota errors are identified and the key travels only in a header', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, request) => {
      assert.ok(!url.includes('secret'));
      assert.equal(request.headers['x-goog-api-key'], 'secret');
      return { ok: false, status: 429 };
    };
    await assert.rejects(solve({ apiKey: 'secret' }, 'image'), error => error.status === 429 && error.message.includes('60 seconds'));
  } finally { globalThis.fetch = original; }
});

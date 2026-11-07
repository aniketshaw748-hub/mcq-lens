import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction, reasoningMessages, applyDecisions, solveMCQ } from '../src/mcq.js';

const extracted = [{ question: 'Calculate the average waiting time.', selectionMode: 'single', options: ['5.5 ms', '6.5 ms', '7.5 ms', '8.5 ms'].map((text, i) => ({ text, box: [i * 100, 0, i * 100 + 50, 500] })) }];
const decision = { questionIndex: 0, selectedOptionIndices: [1], explanation: 'The waiting times are 9, 0, 15 and 2 ms; their average is 6.5 ms.', confidence: 'high' };
test('extracts options as data, not correct answers', () => {
  const questions = validateExtraction({ questions: extracted });
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].answers, undefined);
  assert.ok(!reasoningMessages(questions)[1].content.includes('box'));
  const output = applyDecisions(questions, { decisions: [decision] });
  assert.deepEqual(output[0].answers, [extracted[0].options[1]]);
});
test('rejects four selections, invalid indices, duplicates and missing decisions', () => {
  for (const indices of [[0, 1, 2, 3], [0, 1], [4], [-1], [1, 1], [1.5]]) assert.throws(() => applyDecisions(extracted, { decisions: [{ ...decision, selectedOptionIndices: indices }] }));
  assert.throws(() => applyDecisions(extracted, { decisions: [] }));
  assert.throws(() => applyDecisions(extracted, { decisions: [{ ...decision, questionIndex: 1 }] }));
});
test('multiple answers require an explicit multiple-answer instruction', () => {
  assert.equal(validateExtraction({ questions: [{ ...extracted[0], selectionMode: 'multiple' }] })[0].selectionMode, 'single');
  const multiple = validateExtraction({ questions: [{ ...extracted[0], question: 'Select all that apply: which values satisfy x > 0?', selectionMode: 'multiple' }] });
  assert.equal(applyDecisions(multiple, { decisions: [{ ...decision, selectedOptionIndices: [0, 2] }] })[0].answers.length, 2);
  assert.equal(applyDecisions(extracted, { decisions: [{ ...decision, selectedOptionIndices: [], confidence: 'high' }] })[0].confidence, 'low');
});
test('bad transcription is rejected before any reasoning', () => {
  assert.throws(() => validateExtraction({ questions: [{ ...extracted[0], options: [extracted[0].options[0]] }] }));
  assert.throws(() => validateExtraction({ questions: [{ ...extracted[0], options: [extracted[0].options[0], extracted[0].options[0]] }] }));
});
test('screenshot reader never selects answers; invalid first solver falls back instead of highlighting all four', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const env = { GEMINI_API_KEY: 'test-reader', GROQ_API_KEY: 'test-solver', QUOTA: { getByName: () => ({ reserve: async () => ({ id: 'lease' }), release: async () => {} }) } };
  globalThis.fetch = async (url, request) => {
    const body = JSON.parse(request.body); requests.push(body);
    if (url.includes('googleapis')) {
      assert.ok(body.systemInstruction.parts[0].text.includes('do NOT solve'));
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ questions: extracted }) }] } }] });
    }
    assert.equal(body.messages.length, 2);
    assert.ok(!JSON.stringify(body).includes('inlineData'));
    const selectedOptionIndices = body.model.endsWith('120b') ? [0, 1, 2, 3] : [1];
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decisions: [{ ...decision, selectedOptionIndices }] }) } }] });
  };
  try {
    const output = await solveMCQ(env, { image: 'test-image', mode: 'mcq' }, new AbortController().signal);
    assert.equal(requests.length, 3);
    assert.equal(output.provider, 'Groq');
    assert.equal(output.model, 'openai/gpt-oss-20b');
    assert.deepEqual(output.questions[0].answers, [extracted[0].options[1]]);
  } finally { globalThis.fetch = originalFetch; }
});
test('page text skips vision and works with only a text provider configured', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, request) => {
    calls++;
    assert.ok(url.includes('groq.com'));
    const body = JSON.parse(request.body);
    assert.ok(body.messages[1].content.includes('Calculate the average waiting time.'));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decisions: [decision] }) } }] });
  };
  try {
    const env = { GROQ_API_KEY: 'test-solver', QUOTA: { getByName: () => ({ reserve: async () => ({ id: 'lease' }), release: async () => {} }) } };
    const output = await solveMCQ(env, { extractedQuestions: extracted, mode: 'mcq' }, new AbortController().signal);
    assert.equal(calls, 1);
    assert.equal(output.reader, 'page-text');
    assert.equal(output.questions[0].answers[0].text, '6.5 ms');
  } finally { globalThis.fetch = originalFetch; }
});
test('reading failures preserve stage and daily-limit reason', async () => {
  const env = { GEMINI_API_KEY: 'test-reader', QUOTA: { getByName: () => ({ reserve: async () => ({ reason: 'daily', retryMs: 60000 }) }) } };
  await assert.rejects(solveMCQ(env, { image: 'test-image', mode: 'mcq' }), error => error.stage === 'reading' && error.reason === 'daily' && error.message.includes('screenshot-reading allowance'));
});
test('when Gemini is out for the day, Groq vision reads the screenshot', async () => {
  const originalFetch = globalThis.fetch;
  const models = [];
  globalThis.fetch = async (url, request) => {
    const body = JSON.parse(request.body); models.push(body.model);
    assert.ok(!url.includes('googleapis'));
    if (body.model === 'qwen/qwen3.8-27b') {
      assert.equal(body.reasoning_effort, 'none');
      assert.equal(body.thinking, undefined);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ questions: extracted }) } }] });
    }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decisions: [decision] }) } }] });
  };
  try {
    const quota = name => ({ reserve: async () => name === 'provider:gemini' ? { reason: 'daily', retryMs: 60000 } : { id: 'lease' }, release: async () => {} });
    const env = { GEMINI_API_KEY: 'test-reader', GROQ_API_KEY: 'test-groq', ZAI_API_KEY: 'test-zai', QUOTA: { getByName: quota } };
    const output = await solveMCQ(env, { image: 'test-image', mode: 'mcq' }, new AbortController().signal);
    assert.equal(output.reader, 'groqvision');
    assert.deepEqual(models, ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
  } finally { globalThis.fetch = originalFetch; }
});

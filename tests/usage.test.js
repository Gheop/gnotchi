import { test, assertEqual, assertTrue, run } from './harness.js';
import { parseUsageLine, sumUsage, headline, humanize, startOfTodayMs }
    from '../lib/usage.js';

const LINE = JSON.stringify({
    type: 'assistant', timestamp: '2026-05-19T09:40:14.200Z',
    sessionId: 's', cwd: '/x',
    message: { model: 'claude-opus-4-7', usage: {
        input_tokens: 2, output_tokens: 272,
        cache_creation_input_tokens: 19042, cache_read_input_tokens: 9475 } },
});

test('parseUsageLine extrait usage + ts', () => {
    const e = parseUsageLine(LINE);
    assertEqual(e.input, 2);
    assertEqual(e.output, 272);
    assertEqual(e.cacheCreation, 19042);
    assertEqual(e.cacheRead, 9475);
    assertEqual(e.ts, Date.parse('2026-05-19T09:40:14.200Z'));
});

test('parseUsageLine cas nuls', () => {
    assertEqual(parseUsageLine('pas du json'), null);
    assertEqual(parseUsageLine(JSON.stringify({ message: {} })), null);
    assertEqual(parseUsageLine(JSON.stringify({ message: { usage: {} }, timestamp: 'x' })),
        { ts: null, input: 0, output: 0, cacheCreation: 0, cacheRead: 0 });
});

test('sumUsage filtre par fenêtre, ignore ts null', () => {
    const es = [
        { ts: 1000, input: 1, output: 2, cacheCreation: 3, cacheRead: 4 },
        { ts: 500, input: 10, output: 0, cacheCreation: 0, cacheRead: 0 },
        { ts: null, input: 99, output: 0, cacheCreation: 0, cacheRead: 0 },
    ];
    assertEqual(sumUsage(es, 1000),
        { input: 1, output: 2, cacheCreation: 3, cacheRead: 4 });
});

test('headline', () => {
    assertEqual(headline({ input: 1, output: 2, cacheCreation: 3, cacheRead: 4 }),
        { work: 6, cache: 4 });
});

test('humanize', () => {
    assertEqual(humanize(0), '0');
    assertEqual(humanize(999), '999');
    assertEqual(humanize(1000), '1k');
    assertEqual(humanize(1500), '1.5k');
    assertEqual(humanize(2000000), '2M');
    assertEqual(humanize(3400000), '3.4M');
    assertEqual(humanize(1100000000), '1.1G');
});

test('startOfTodayMs = minuit local', () => {
    const now = new Date(2026, 4, 19, 13, 37, 5, 9);
    const expected = new Date(2026, 4, 19, 0, 0, 0, 0).getTime();
    assertEqual(startOfTodayMs(now.getTime()), expected);
});

run();

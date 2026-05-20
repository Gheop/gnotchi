import { test, assertEqual, assertTrue, run } from './harness.js';
import {
    parseUsageLine, sumUsage, headline, humanize, startOfTodayMs,
    aggregateByDay, sparkline, aggregateByProject, prettyProject,
} from '../lib/usage.js';

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

test('aggregateByDay : 7 jours, bucket par jour local', () => {
    const day = 86400000;
    const today = startOfTodayMs(Date.now());
    const mkEntry = (ts, w) => ({
        ts, input: w, output: 0, cacheCreation: 0, cacheRead: 1,
    });
    const entries = [
        mkEntry(today, 100),                   // bucket[6]
        mkEntry(today + 3600000, 50),          // bucket[6] aussi
        mkEntry(today - day + 7200000, 20),    // bucket[5]
        mkEntry(today - 6 * day, 5),           // bucket[0]
        mkEntry(today - 7 * day, 999),         // hors fenêtre (trop vieux)
        mkEntry(today + day, 99),              // hors fenêtre (futur)
    ];
    const buckets = aggregateByDay(entries, today, 7);
    assertEqual(buckets.length, 7);
    assertEqual(buckets[6].work, 150);
    assertEqual(buckets[6].cache, 2);
    assertEqual(buckets[5].work, 20);
    assertEqual(buckets[0].work, 5);
    assertEqual(buckets[1].work, 0);
});

test('sparkline : vide, plat, échelle relative', () => {
    assertEqual(sparkline([]), '');
    assertEqual(sparkline([0, 0, 0]), '▁▁▁');
    const s = sparkline([0, 1, 5, 10]);
    assertEqual(s.length, 4);
    assertEqual(s[0], '▁');
    assertEqual(s[3], '█');
    assertTrue(s[1] !== '▁'); // valeur > 0 doit être au moins le 2e niveau
});

test('aggregateByProject : tri par work desc, sans cap', () => {
    const mk = (project, w, ts = 1000) => ({
        ts, project, input: w, output: 0, cacheCreation: 0, cacheRead: 1,
    });
    const entries = [
        mk('p-a', 100),
        mk('p-b', 500),
        mk('p-a', 50),
        mk('p-c', 200),
    ];
    const r = aggregateByProject(entries, 0);
    assertEqual(r.length, 3);
    assertEqual(r[0], { project: 'p-b', work: 500, cache: 1 });
    assertEqual(r[1], { project: 'p-c', work: 200, cache: 1 });
    assertEqual(r[2], { project: 'p-a', work: 150, cache: 2 });
});

test('aggregateByProject : filtre par sinceMs et ignore sans project', () => {
    const entries = [
        { ts: 100, project: 'p', input: 1, output: 0, cacheCreation: 0, cacheRead: 0 },
        { ts: 50, project: 'p', input: 999, output: 0, cacheCreation: 0, cacheRead: 0 },
        { ts: 100, input: 9, output: 0, cacheCreation: 0, cacheRead: 0 }, // pas de project
    ];
    const r = aggregateByProject(entries, 100);
    assertEqual(r, [{ project: 'p', work: 1, cache: 0 }]);
});

test('prettyProject : dernier segment du slug', () => {
    assertEqual(prettyProject('-home-sib-src-gnotchi'), 'gnotchi');
    assertEqual(prettyProject('home-sib-myapp'), 'myapp');
    assertEqual(prettyProject('mono'), 'mono');
    assertEqual(prettyProject(''), '?');
    assertEqual(prettyProject(null), '?');
});

run();

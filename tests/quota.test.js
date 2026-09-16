import { test, assertEqual, assertTrue, run } from './harness.js';
import { parseQuota, extractToken, isTokenExpired, formatQuota } from '../lib/quota.js';

const NOW = Date.parse('2026-09-16T10:00:00Z');

// Réponse réelle de /api/oauth/usage, réduite aux champs utilisés.
const SAMPLE = JSON.stringify({
    five_hour: { utilization: 12.0, resets_at: '2026-09-16T12:00:00Z' },
    seven_day: { utilization: 26.0, resets_at: '2026-09-20T13:00:00Z' },
    seven_day_opus: null,
    limits: [
        {
            kind: 'session', group: 'session', percent: 12,
            severity: 'normal', resets_at: '2026-09-16T12:00:00Z',
            scope: null, is_active: false,
        },
        {
            kind: 'weekly_all', group: 'weekly', percent: 26,
            severity: 'normal', resets_at: '2026-09-20T13:00:00Z',
            scope: null, is_active: true,
        },
        {
            kind: 'weekly_scoped', group: 'weekly', percent: 5,
            severity: 'normal', resets_at: '2026-09-20T13:00:00Z',
            scope: { model: { id: null, display_name: 'Fable' } },
            is_active: false,
        },
    ],
});

test('parseQuota : réponse complète', () => {
    const q = parseQuota(SAMPLE);
    assertEqual(q.session.pct, 12);
    assertEqual(q.weekly.pct, 26);
    assertEqual(q.scoped.pct, 5);
    assertEqual(q.scoped.scope, 'Fable');
    assertEqual(q.session.severity, 'normal');
    assertEqual(q.session.resetsAt, Date.parse('2026-09-16T12:00:00Z'));
});

test('parseQuota : repli sur les champs plats sans limits', () => {
    const q = parseQuota({
        five_hour: { utilization: 40, resets_at: '2026-09-16T12:00:00Z' },
        seven_day: { utilization: 70, resets_at: null },
    });
    assertEqual(q.session.pct, 40);
    assertEqual(q.weekly.pct, 70);
    assertEqual(q.weekly.resetsAt, null);
    assertEqual(q.scoped, null);
});

test('parseQuota : entrées inexploitables', () => {
    assertEqual(parseQuota('pas du json'), null);
    assertEqual(parseQuota(null), null);
    assertEqual(parseQuota('{}'), null);
    assertEqual(parseQuota({ five_hour: null, seven_day: null }), null);
});

test('parseQuota : pourcentages bornés', () => {
    const q = parseQuota({ five_hour: { utilization: 130 }, seven_day: { utilization: -4 } });
    assertEqual(q.session.pct, 100);
    assertEqual(q.weekly.pct, 0);
});

test('parseQuota : resets_at en epoch secondes ou millisecondes', () => {
    const sec = parseQuota({ five_hour: { utilization: 1, resets_at: 1789561189 } });
    assertEqual(sec.session.resetsAt, 1789561189000);
    const ms = parseQuota({ five_hour: { utilization: 1, resets_at: 1789561189858 } });
    assertEqual(ms.session.resetsAt, 1789561189858);
});

test('extractToken : chemin claudeAiOauth', () => {
    assertEqual(extractToken('{"claudeAiOauth":{"accessToken":"sk-tok"}}'), 'sk-tok');
    assertEqual(extractToken('{"accessToken":"plat"}'), 'plat');
    assertEqual(extractToken('{"claudeAiOauth":{}}'), null);
    assertEqual(extractToken('cassé'), null);
});

test('isTokenExpired', () => {
    assertTrue(isTokenExpired('{"claudeAiOauth":{"expiresAt":1000}}', 2000));
    assertTrue(!isTokenExpired('{"claudeAiOauth":{"expiresAt":9000}}', 2000));
    assertTrue(!isTokenExpired('{"claudeAiOauth":{}}', 2000));
    assertTrue(!isTokenExpired('cassé', 2000));
});

test('formatQuota : deux lignes lisibles', () => {
    const f = formatQuota(parseQuota(SAMPLE), NOW);
    assertEqual(f.session, 'Quota session : 5 h 12 % · reset dans 2h');
    assertEqual(f.weekly,
        'Quota hebdo : 7 j 26 % · reset dans 4d3h  ·  dont Fable 5 % · reset dans 4d3h');
});

test('formatQuota : fenêtre manquante et reset passé', () => {
    assertEqual(formatQuota(null, NOW), null);
    const f = formatQuota({
        session: { pct: 99, resetsAt: NOW - 1000, severity: null, scope: null },
        weekly: null,
        scoped: null,
    }, NOW);
    assertEqual(f.session, 'Quota session : 5 h 99 % · reset imminent');
    assertEqual(f.weekly, 'Quota hebdo : 7 j —');
});

run();

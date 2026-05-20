// Mini runner pour `gjs -m`. Aucune dépendance.
import system from 'system';

const _tests = [];
let _failures = 0;

export function test(name, fn) {
    _tests.push({ name, fn });
}

export function assertEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`assertEqual ${msg}\n  attendu: ${e}\n  obtenu : ${a}`);
}

export function assertTrue(cond, msg = '') {
    if (!cond)
        throw new Error(`assertTrue échoué ${msg}`);
}

export function run() {
    for (const { name, fn } of _tests) {
        try {
            fn();
            print(`ok   ${name}`);
        } catch (e) {
            _failures++;
            print(`FAIL ${name}: ${e.message}`);
        }
    }
    print(`\n${_tests.length - _failures}/${_tests.length} ok`);
    if (_failures > 0)
        system.exit(1);
}

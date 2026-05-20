import { test, assertEqual, run } from './harness.js';
import { isSignificant, shouldDisplay } from '../lib/feed.js';

test('isSignificant : événements à gros impact', () => {
    assertEqual(isSignificant({ event: 'SessionStart' }), true);
    assertEqual(isSignificant({ event: 'Stop' }), true);
    assertEqual(isSignificant({ event: 'PreCompact' }), true);
    assertEqual(isSignificant({ event: 'SessionEnd' }), true);
});

test('isSignificant : PostToolUse selon is_error', () => {
    assertEqual(isSignificant({ event: 'PostToolUse' }), false);
    assertEqual(isSignificant({ event: 'PostToolUse', data: {} }), false);
    assertEqual(isSignificant({ event: 'PostToolUse', data: { is_error: false } }), false);
    assertEqual(isSignificant({ event: 'PostToolUse', data: { is_error: true } }), true);
});

test('isSignificant : événements de bruit rejetés', () => {
    assertEqual(isSignificant({ event: 'PreToolUse' }), false);
    assertEqual(isSignificant({ event: 'UserPromptSubmit' }), false);
    assertEqual(isSignificant({ event: 'Notification' }), false);
    assertEqual(isSignificant({ event: 'Emotion' }), false);
});

test('isSignificant : entrées malformées', () => {
    assertEqual(isSignificant(null), false);
    assertEqual(isSignificant({}), false);
    assertEqual(isSignificant({ event: 42 }), false);
    assertEqual(isSignificant({ event: '' }), false);
});

test('shouldDisplay : mode all laisse tout passer', () => {
    assertEqual(shouldDisplay({ event: 'PreToolUse' }, 'all'), true);
    assertEqual(shouldDisplay({ event: 'Stop' }, 'all'), true);
});

test('shouldDisplay : mode significant filtre', () => {
    assertEqual(shouldDisplay({ event: 'PreToolUse' }, 'significant'), false);
    assertEqual(shouldDisplay({ event: 'Stop' }, 'significant'), true);
});

run();

import { MOODS } from './sentiment.js';

export const ACTIVITIES = ['idle', 'working', 'waiting', 'sleeping', 'compacting', 'waving'];

export function initialState(now) {
    return { activity: 'idle', mood: 'neutral', lastEventTs: now, bornTs: now, ended: false };
}

function withEmotion(state, data) {
    if (data && typeof data.emotion === 'string' && MOODS.includes(data.emotion))
        return data.emotion;
    return state.mood;
}

export function reduce(state, event, now) {
    const base = { ...state, lastEventTs: now };
    switch (event.event) {
    case 'SessionStart':
        return { ...base, activity: 'waving', mood: 'neutral' };
    case 'UserPromptSubmit':
        return { ...base, activity: 'working', mood: withEmotion(state, event.data) };
    case 'PreToolUse':
    case 'PostToolUse':
        return { ...base, activity: 'working' };
    case 'Notification':
        return { ...base, activity: 'waiting' };
    case 'Stop':
        return { ...base, activity: 'idle' };
    case 'PreCompact':
        return { ...base, activity: 'compacting' };
    case 'SessionEnd':
        // Terminal : les appelants ne doivent plus dispatcher d'événement sur cet état.
        return { ...base, ended: true };
    case 'Emotion':
        return { ...base, mood: withEmotion(state, event.data) };
    default:
        return base;
    }
}

export function shouldDecayWorking(state, now, decayMs) {
    return state.activity === 'working' && (now - state.lastEventTs) >= decayMs;
}

export function shouldDecayWaving(state, now, decayMs) {
    return state.activity === 'waving' && (now - state.lastEventTs) >= decayMs;
}

export function applyDecay(state) {
    if (state.activity === 'working' || state.activity === 'waving')
        return { ...state, activity: 'idle' };
    return state;
}

export function isExpired(state, now, idleTimeoutMs) {
    return (now - state.lastEventTs) >= idleTimeoutMs;
}

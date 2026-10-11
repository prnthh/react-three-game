import type { Component } from 'react-three-game/viewer';
import { DEFAULT_MOVEMENT_SETTINGS } from '../movement';
import CharacterView, { type CharacterProperties } from './CharacterView';

// Keep the definition outside the React module so controller edits stop at its Fast Refresh boundary.
export const CharacterComponent: Component<CharacterProperties> = {
    name: 'ParkourCharacter',
    renderWhenDisabled: true,
    description: 'Parkour player controller. Runs in Play; movement stays in demo state.',
    properties: {
        speed: { default: DEFAULT_MOVEMENT_SETTINGS.speed, min: 1, max: 27, step: 0.5, description: 'Acceleration target in world units per second; carried momentum may exceed it.' },
        jumpSpeed: { default: DEFAULT_MOVEMENT_SETTINGS.jumpSpeed, min: 1, max: 15, step: 0.5, description: 'Upward impulse for ground jumps; default rises approximately 1.4 world units. Wall jumps add a smaller impulse.' },
        slideBoost: { default: DEFAULT_MOVEMENT_SETTINGS.slideBoost, min: 0, max: 8, step: 0.25, description: 'One-time speed added when crouching above crouch speed. Sliding slows toward crouch speed with movement held, or stops with no input.' },
        color: { type: 'color', default: '#38bdf8' },
        cameraBob: { type: 'boolean', default: true, label: 'Camera bob', description: 'Bob the first-person camera while running.' },
        debug: { type: 'boolean', default: false, description: 'In Play, follow behind the capsule and show the first-person camera frustum.' },
    }, View: CharacterView,
};

import React from 'react';
import { getRoleLabel } from '../roomHelpers';
import SecretReveal from './SecretReveal';

// Compact reminder of the player's role (and the word, if they know it)
// during the quiz. Everyone gets one so it doesn't single anyone out.
export default function RoleChip({ role, secretWord }) {
    if (!role) return null;

    const knowsWord = role === 'MASTER' || role === 'INSIDER';
    const roleClass = role.toLowerCase();

    return (
        <SecretReveal
            className="role-chip"
            coverLabel="TAP TO SEE YOUR ROLE"
            autoHideMs={6000}
        >
            <span className={`role-chip-role player-role ${roleClass}`}>{getRoleLabel(role)}</span>
            {knowsWord && secretWord ? (
                <span className="role-chip-word">{secretWord}</span>
            ) : (
                <span className="role-chip-note">YOU DON'T KNOW THE WORD</span>
            )}
        </SecretReveal>
    );
}

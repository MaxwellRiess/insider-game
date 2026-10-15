import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getJoinLink } from '../roomHelpers';

// navigator.clipboard needs a secure context, so fall back to a hidden
// textarea when testing over plain http on a local network.
async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy failed');
}

export default function InvitePanel({ roomCode }) {
    const [status, setStatus] = useState('');
    const [qrExpanded, setQrExpanded] = useState(false);
    const link = getJoinLink(roomCode);
    const inviteText = `Join my Insider game: ${link} (room code ${roomCode})`;
    const canShare = typeof navigator.share === 'function';

    useEffect(() => {
        if (!status) return undefined;
        const timeout = setTimeout(() => setStatus(''), 2500);
        return () => clearTimeout(timeout);
    }, [status]);

    useEffect(() => {
        if (!qrExpanded) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setQrExpanded(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [qrExpanded]);

    const handleShare = async () => {
        try {
            await navigator.share({ title: 'Join my Insider game', text: `Room code ${roomCode}`, url: link });
        } catch (error) {
            if (error?.name !== 'AbortError') setStatus('SHARING FAILED, COPY THE INVITE INSTEAD');
        }
    };

    const handleCopy = async () => {
        try {
            await copyText(inviteText);
            setStatus('INVITE COPIED');
        } catch {
            setStatus('COPY FAILED, SHARE THE CODE INSTEAD');
        }
    };

    return (
        <div className="invite-panel">
            <span className="room-code-label">ROOM CODE</span>
            <span className="room-code-value" aria-label={`Room code ${roomCode.split('').join(' ')}`}>{roomCode}</span>

            <button
                type="button"
                className="invite-qr"
                onClick={() => setQrExpanded(true)}
                aria-label="Show a larger QR code to scan"
            >
                <QRCodeSVG value={link} size={144} marginSize={2} title={`QR code to join room ${roomCode}`} />
                <span className="invite-qr-hint">SCAN TO JOIN · TAP TO ENLARGE</span>
            </button>

            <div className={`invite-actions${canShare ? '' : ' single'}`}>
                {canShare && (
                    <button type="button" className="btn secondary" onClick={handleShare}>SHARE</button>
                )}
                <button type="button" className="btn secondary" onClick={handleCopy}>COPY INVITE</button>
            </div>
            <span className="share-status" role="status">{status}</span>

            {qrExpanded && (
                <div
                    className="qr-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Scan to join room ${roomCode}`}
                    onClick={() => setQrExpanded(false)}
                >
                    <div className="qr-overlay-card" onClick={(event) => event.stopPropagation()}>
                        <QRCodeSVG value={link} size={320} marginSize={2} className="qr-overlay-code" />
                        <p className="qr-overlay-title">SCAN TO JOIN</p>
                        <p className="qr-overlay-code-text">{roomCode}</p>
                    </div>
                    <button type="button" className="btn primary qr-overlay-close" onClick={() => setQrExpanded(false)} autoFocus>
                        DONE
                    </button>
                </div>
            )}
        </div>
    );
}

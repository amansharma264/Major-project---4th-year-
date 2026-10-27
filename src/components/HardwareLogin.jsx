'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export default function HardwareLogin({ onAuthenticated }) {
  const [hardwareState, setHardwareState] = useState({
    deviceConnected: false,
    pinLength: 0,
    locked: false,
    lockoutRemaining: 0,
    wrongAttempts: 0,
    attemptsLeft: 3,
    latestEvent: null,
    unlockTicket: null
  });

  const [authError, setAuthError] = useState(null);
  const [isVerifyingTicket, setIsVerifyingTicket] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const consumedTicketsRef = useRef(new Set());
  const onAuthRef = useRef(onAuthenticated);

  useEffect(() => {
    onAuthRef.current = onAuthenticated;
  }, [onAuthenticated]);

  // Function to trade the ESP32 one-time unlock ticket for an HttpOnly session cookie
  const exchangeTicketForSession = useCallback(async (ticket) => {
    if (!ticket || consumedTicketsRef.current.has(ticket) || isVerifyingTicket) return;
    consumedTicketsRef.current.add(ticket);
    setIsVerifyingTicket(true);
    setUnlockSuccess(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/login-with-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTimeout(() => {
          if (onAuthRef.current) onAuthRef.current();
        }, 1000);
      } else {
        setAuthError(data.error || 'Authentication failed. Please re-enter PIN on hardware.');
        setUnlockSuccess(false);
        setIsVerifyingTicket(false);
      }
    } catch (err) {
      setAuthError('Connection error while finalizing session: ' + err.message);
      setUnlockSuccess(false);
      setIsVerifyingTicket(false);
    }
  }, [isVerifyingTicket]);

  const exchangeRef = useRef(exchangeTicketForSession);
  useEffect(() => {
    exchangeRef.current = exchangeTicketForSession;
  }, [exchangeTicketForSession]);

  // Setup Real-Time Stream (SSE) + Fallback Polling
  useEffect(() => {
    let eventSource = null;
    let pollInterval = null;
    let isMounted = true;

    const handleStateUpdate = (newState) => {
      if (!isMounted || !newState) return;
      setHardwareState(prev => ({
        ...prev,
        ...newState
      }));

      // If wrong attempt event or locked event received, update error messages
      if (newState.locked) {
        setAuthError(`Security Lockout: 3 wrong attempts. Cooldown: ${newState.lockoutRemaining || 30}s.`);
      } else if (newState.latestEvent?.type === 'denied') {
        setAuthError(`Access Denied: Incorrect PIN. ${newState.attemptsLeft ?? (3 - (newState.wrongAttempts || 1))} attempt(s) remaining.`);
      } else if (newState.latestEvent?.type === 'clear') {
        setAuthError(null);
      }

      // If an unlock ticket is ready from the hardware verification, claim it!
      if (newState.unlockTicket) {
        if (exchangeRef.current) exchangeRef.current(newState.unlockTicket);
      }
    };

    // 1. Try Server-Sent Events (SSE)
    try {
      eventSource = new EventSource('/api/auth/stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleStateUpdate(data);
        } catch {
          // ignore malformed data
        }
      };

      eventSource.onerror = () => {
        // Fallback to polling if SSE has any connection issue
        if (!pollInterval) {
          pollInterval = setInterval(fetchStatusFallback, 1000);
        }
      };
    } catch {
      // EventSource not supported or failed to construct
      pollInterval = setInterval(fetchStatusFallback, 1000);
    }

    // 2. Initial state & polling fallback function
    const fetchStatusFallback = async () => {
      try {
        const res = await fetch('/api/auth/status', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.hardware) {
            handleStateUpdate(data.hardware);
          }
        }
      } catch {
        // network error handled silently in background
      }
    };

    fetchStatusFallback();
    pollInterval = setInterval(fetchStatusFallback, 1200);

    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient security lighting */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-xl relative z-10 space-y-6">
        
        {/* TOP BRAND HEADER */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-mono text-cyan-400 mb-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            HARDWARE-AUTHENTICATED ACCESS GATEWAY
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center justify-center gap-3">
            <span className="p-2 bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 rounded-xl shadow-lg font-black text-xl">
              3S
            </span>
            TRIPLE-SHIELD VAULT
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Zero-Trust Vault Core protected by Physical ESP32 Hardware Keypad & 3-Layer Defense Architecture.
          </p>
        </div>

        {/* MAIN HARDWARE LOGIN CARD */}
        <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-purple-500" />

          {/* HARDWARE CONNECTION STATUS BAR */}
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${
                hardwareState.deviceConnected 
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400' 
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
              }`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  ESP32 Dev Module
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    hardwareState.deviceConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`} />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {hardwareState.deviceConnected ? 'Connected via Wi-Fi (Keypad Active)' : 'Hardware Link Offline (Waiting for ESP32)'}
                </div>
              </div>
            </div>

            <div className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
              hardwareState.deviceConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {hardwareState.deviceConnected ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>

          {/* DISCONNECTED WARNING CALLOUT */}
          {!hardwareState.deviceConnected && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs space-y-1 mb-6 font-mono">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Physical ESP32 Hardware Disconnected
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Power on your ESP32 module and confirm it is connected to your local Wi-Fi. The device will automatically establish a secure heartbeat with this server.
              </p>
            </div>
          )}

          {/* PIN MASKED DISPLAY */}
          <div className="space-y-4 py-2">
            <div className="text-center">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Live Keypad Entry Buffer (Masked)
              </label>
              <div className="text-[11px] text-cyan-400 font-mono mt-0.5">
                Physical PIN Entry on 4×4 Matrix Keypad
              </div>
            </div>

            {/* 4 Security Digit Slots */}
            <div className="flex justify-center items-center gap-3 sm:gap-4 my-6">
              {[0, 1, 2, 3].map((index) => {
                const isEntered = index < hardwareState.pinLength;
                return (
                  <div
                    key={index}
                    className={`w-14 h-16 sm:w-16 sm:h-20 rounded-2xl flex items-center justify-center border-2 transition-all duration-200 ${
                      unlockSuccess
                        ? 'bg-emerald-950/80 border-emerald-400 text-emerald-400 shadow-lg shadow-emerald-500/20'
                        : hardwareState.locked
                        ? 'bg-red-950/40 border-red-500/50 text-red-400'
                        : isEntered
                        ? 'bg-slate-900 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/30 scale-105'
                        : 'bg-slate-950/60 border-slate-800 text-slate-700'
                    }`}
                  >
                    {unlockSuccess ? (
                      <span className="text-2xl text-emerald-400 animate-pulse">✓</span>
                    ) : isEntered ? (
                      <span className="w-4 h-4 rounded-full bg-cyan-400 animate-pulse shadow-md shadow-cyan-400" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-800" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* HARDWARE INSTRUCTIONS MATRIX */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px] text-slate-300 pt-2">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="block text-cyan-400 font-bold mb-0.5">0-9</span>
                <span className="text-slate-400 text-[10px]">Enter Digits</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="block text-amber-400 font-bold mb-0.5">*</span>
                <span className="text-slate-400 text-[10px]">Clear PIN</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="block text-emerald-400 font-bold mb-0.5">#</span>
                <span className="text-slate-400 text-[10px]">Submit & Verify</span>
              </div>
            </div>

            {/* SUCCESS BANNER */}
            {unlockSuccess && (
              <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs font-mono text-center flex items-center justify-center gap-2 animate-pulse">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>ACCESS GRANTED // Loading Protected Triple-Shield Vault...</span>
              </div>
            )}

            {/* LOCKOUT ALERT */}
            {hardwareState.locked && (
              <div className="p-4 rounded-xl bg-red-950/80 border border-red-500 text-red-200 text-xs font-mono space-y-1">
                <div className="font-bold flex items-center gap-2 text-red-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  SECURITY LOCKOUT ACTIVE
                </div>
                <p className="text-[11px] text-slate-300">
                  3 consecutive failed attempts detected. Cooldown remaining: <strong className="text-red-400">{hardwareState.lockoutRemaining} seconds</strong>.
                </p>
              </div>
            )}

            {/* ERROR NOTIFICATION */}
            {authError && !hardwareState.locked && !unlockSuccess && (
              <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>{authError}</span>
              </div>
            )}
          </div>
        </div>

        {/* SECURITY ARCHITECTURE FOOTER BADGES */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-mono">
            <span className="text-cyan-400 block font-semibold mb-0.5">🔒 Layer 1 Cryptography</span>
            <span className="text-slate-400 text-[10px]">AES-256 Client-Side Cipher</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-mono">
            <span className="text-emerald-400 block font-semibold mb-0.5">🖼️ Layer 2 Steganography</span>
            <span className="text-slate-400 text-[10px]">LSB Spatial Pixel Matrix</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-mono">
            <span className="text-purple-400 block font-semibold mb-0.5">⛓️ Layer 3 Web3 Ledger</span>
            <span className="text-slate-400 text-[10px]">On-Chain Hash Verification</span>
          </div>
        </div>

        <div className="text-center text-[11px] font-mono text-slate-500">
          Hardware PIN is verified by Server Core & ESP32 firmware • Never exposed in browser JavaScript or localStorage
        </div>
      </div>
    </div>
  );
}

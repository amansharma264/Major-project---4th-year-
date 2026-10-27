import crypto from 'crypto';

// In-memory shared state across Next.js API route invocations in the same Node process
if (!globalThis.__vaultHardwareState) {
  globalThis.__vaultHardwareState = {
    lastHeartbeat: 0,
    deviceIp: null,
    pinLength: 0,
    wrongAttempts: 0,
    lockedUntil: 0,
    activeUnlockTicket: null,
    ticketExpiresAt: 0,
    latestEvent: {
      type: 'init',
      timestamp: Date.now(),
      message: 'Vault hardware system initialized'
    }
  };
}

const state = globalThis.__vaultHardwareState;

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT_MS = 8000; // 8 seconds offline threshold

export function getDeviceToken() {
  return process.env.ESP32_DEVICE_TOKEN || 'vault_esp32_secret_token_2026';
}

export function getVaultPin() {
  return process.env.VAULT_PIN || '2278';
}

export function isDeviceOnline() {
  return Date.now() - state.lastHeartbeat < HEARTBEAT_TIMEOUT_MS;
}

export function isLocked() {
  return Date.now() < state.lockedUntil;
}

export function getRemainingLockoutSeconds() {
  if (!isLocked()) return 0;
  return Math.max(0, Math.ceil((state.lockedUntil - Date.now()) / 1000));
}

export function recordHeartbeat(ip = null) {
  state.lastHeartbeat = Date.now();
  if (ip) state.deviceIp = ip;
  state.latestEvent = {
    type: 'heartbeat',
    timestamp: Date.now(),
    deviceIp: ip
  };
}

export function recordKeypadEvent(type, count = 0) {
  state.lastHeartbeat = Date.now();
  
  if (type === 'digit') {
    state.pinLength = Math.min(4, Math.max(0, Number(count) || 0));
    state.latestEvent = {
      type: 'digit',
      count: state.pinLength,
      timestamp: Date.now()
    };
  } else if (type === 'clear') {
    state.pinLength = 0;
    state.latestEvent = {
      type: 'clear',
      timestamp: Date.now()
    };
  }
}

export function verifyHardwarePin(pin, providedToken) {
  state.lastHeartbeat = Date.now();

  const expectedToken = getDeviceToken();
  if (!providedToken || providedToken !== expectedToken) {
    return {
      success: false,
      error: 'UNAUTHORIZED_DEVICE',
      message: 'Invalid ESP32 device token'
    };
  }

  // Check lockout status
  if (isLocked()) {
    const remaining = getRemainingLockoutSeconds();
    state.latestEvent = {
      type: 'locked',
      remaining,
      timestamp: Date.now()
    };
    return {
      success: false,
      locked: true,
      attemptsLeft: 0,
      remainingSeconds: remaining,
      message: `System locked for ${remaining} more seconds`
    };
  }

  const expectedPin = getVaultPin();

  if (pin === expectedPin) {
    // Correct PIN
    state.wrongAttempts = 0;
    state.pinLength = 0;
    state.lockedUntil = 0;
    
    // Generate single-use cryptographically secure ticket valid for 30s
    const ticket = crypto.randomUUID();
    state.activeUnlockTicket = ticket;
    state.ticketExpiresAt = Date.now() + 30000;

    state.latestEvent = {
      type: 'granted',
      timestamp: Date.now()
    };

    return {
      success: true,
      message: 'Access Granted'
    };
  } else {
    // Wrong PIN
    state.wrongAttempts += 1;
    state.pinLength = 0;
    const remainingAttempts = Math.max(0, MAX_ATTEMPTS - state.wrongAttempts);

    if (state.wrongAttempts >= MAX_ATTEMPTS) {
      state.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      state.latestEvent = {
        type: 'locked',
        remaining: 30,
        timestamp: Date.now()
      };
      return {
        success: false,
        locked: true,
        attemptsLeft: 0,
        remainingSeconds: 30,
        message: 'Maximum attempts exceeded. 30-second lockout engaged.'
      };
    } else {
      state.latestEvent = {
        type: 'denied',
        attemptsLeft: remainingAttempts,
        timestamp: Date.now()
      };
      return {
        success: false,
        locked: false,
        attemptsLeft: remainingAttempts,
        message: `Incorrect PIN. ${remainingAttempts} attempts remaining.`
      };
    }
  }
}

export function consumeUnlockTicket(ticket) {
  if (
    state.activeUnlockTicket &&
    ticket &&
    state.activeUnlockTicket === ticket &&
    Date.now() < state.ticketExpiresAt
  ) {
    // Single-use consumption
    state.activeUnlockTicket = null;
    state.ticketExpiresAt = 0;
    return true;
  }
  return false;
}

export function getPublicHardwareState() {
  const online = isDeviceOnline();
  const locked = isLocked();
  const lockoutRemaining = getRemainingLockoutSeconds();

  return {
    deviceConnected: online,
    lastHeartbeat: state.lastHeartbeat,
    pinLength: state.pinLength,
    locked,
    lockoutRemaining,
    wrongAttempts: state.wrongAttempts,
    attemptsLeft: locked ? 0 : Math.max(0, MAX_ATTEMPTS - state.wrongAttempts),
    latestEvent: state.latestEvent,
    // Only return unlock ticket if it is active and valid (used by web client to exchange for cookie)
    unlockTicket: state.activeUnlockTicket && Date.now() < state.ticketExpiresAt ? state.activeUnlockTicket : null
  };
}

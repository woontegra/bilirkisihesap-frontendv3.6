export const ADMIN_CHAT_SOUND_STORAGE_KEY = "adminChatSoundEnabled";
/** frontendV3/public/sounds/chat-notification.mp3 */
export const CHAT_NOTIFICATION_SOUND_URL = "/sounds/chat-notification.mp3";

let notificationAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;

function getNotificationAudio(): HTMLAudioElement {
  if (!notificationAudio) {
    notificationAudio = new Audio(CHAT_NOTIFICATION_SOUND_URL);
    notificationAudio.preload = "auto";
    notificationAudio.volume = 0.9;
  }
  return notificationAudio;
}

export function preloadAdminChatNotificationSound(): void {
  try {
    getNotificationAudio().load();
  } catch {
    /* sessiz */
  }
}

export function isAdminChatSoundEnabled(): boolean {
  try {
    return localStorage.getItem(ADMIN_CHAT_SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function dispatchSoundPreferenceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("admin-chat-sound-changed"));
  }
}

export function setAdminChatSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ADMIN_CHAT_SOUND_STORAGE_KEY, enabled ? "true" : "false");
    dispatchSoundPreferenceChanged();
  } catch {
    /* ignore */
  }
}

export function isAdminChatMessage(senderType: string | undefined | null): boolean {
  if (!senderType) return false;
  const normalized = senderType.toLowerCase();
  return normalized === "admin" || normalized === "agent" || normalized === "support";
}

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

function playWebAudioChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  gain.connect(ctx.destination);

  const tones = [880, 1174.66];
  tones.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + index * 0.12);
    osc.connect(gain);
    osc.start(now + index * 0.12);
    osc.stop(now + index * 0.12 + 0.22);
  });
}

async function waitForNotificationAudioReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${CHAT_NOTIFICATION_SOUND_URL} yüklenemedi`));
    };
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

async function playMp3Notification(): Promise<boolean> {
  const audio = getNotificationAudio();
  await waitForNotificationAudioReady(audio);
  audio.currentTime = 0;
  await audio.play();
  return true;
}

export async function playAdminChatNotificationSound(options?: { test?: boolean }): Promise<boolean> {
  if (!options?.test && !isAdminChatSoundEnabled()) {
    return false;
  }

  try {
    await playMp3Notification();
    return true;
  } catch (mp3Error) {
    if (!options?.test) {
      console.warn("[admin-chat-sound] MP3 çalınamadı, Web Audio kullanılıyor:", mp3Error);
    }
    try {
      playWebAudioChime();
      return true;
    } catch (fallbackError) {
      console.warn("[admin-chat-sound] Bildirim sesi çalınamadı:", fallbackError);
      return false;
    }
  }
}

export async function enableAdminChatSoundWithTest(): Promise<boolean> {
  preloadAdminChatNotificationSound();
  const ok = await playAdminChatNotificationSound({ test: true });
  if (ok) {
    setAdminChatSoundEnabled(true);
    preloadAdminChatNotificationSound();
  }
  return ok;
}

export function disableAdminChatSound(): void {
  setAdminChatSoundEnabled(false);
}

export function isUserChatMessage(senderType: string | undefined | null): boolean {
  if (!senderType) return false;
  const normalized = senderType.toLowerCase();
  return normalized === "user" || normalized === "customer" || normalized === "guest";
}

import { useCallback, useEffect, useRef, useState } from "react";

const VOLUME_STORAGE_KEY = "edgescope.reset.audioVolume";
const DEFAULT_VOLUME = 20;
const FADE_DURATION_MS = 2_000;

function savedVolume() {
  try {
    const value = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function useRecentreAudio(initialSource: string) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef(initialSource);
  const loadedSourceRef = useRef<string | null>(null);
  const enabledRef = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const actionRef = useRef(0);

  const cancelFade = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    generationRef.current += 1;
  }, []);

  const fadeTo = useCallback(
    (target: number, duration = FADE_DURATION_MS, complete?: () => void) => {
      const audio = audioRef.current;
      if (!audio) return complete?.();
      cancelFade();
      const generation = generationRef.current;
      const from = audio.volume;
      const started = performance.now();
      const tick = (now: number) => {
        if (generation !== generationRef.current || audio !== audioRef.current) return;
        const progress = Math.min(1, (now - started) / duration);
        audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
        if (progress < 1) {
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        frameRef.current = null;
        complete?.();
      };
      frameRef.current = window.requestAnimationFrame(tick);
    },
    [cancelFade],
  );

  const release = useCallback(() => {
    cancelFade();
    const audio = audioRef.current;
    audioRef.current = null;
    loadedSourceRef.current = null;
    if (!audio) return;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, [cancelFade]);

  const ensureAudio = useCallback(
    (source: string) => {
      if (audioRef.current && loadedSourceRef.current === source) return audioRef.current;
      release();
      const audio = new Audio();
      audio.preload = "none";
      audio.loop = true;
      audio.volume = 0;
      audio.src = source;
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        enabledRef.current = false;
        setEnabled(false);
        setLoading(false);
        setError("Ambient sound could not be loaded. Your session can continue without it.");
        release();
      };
      audioRef.current = audio;
      loadedSourceRef.current = source;
      return audio;
    },
    [release],
  );

  const startPlayback = useCallback(
    async (source: string, action: number, remaining = Number.POSITIVE_INFINITY) => {
      if (!enabledRef.current || volumeRef.current === 0) return;
      const audio = ensureAudio(source);
      setLoading(true);
      audio.volume = 0;
      try {
        await audio.play();
        if (
          action !== actionRef.current ||
          !enabledRef.current ||
          audioRef.current !== audio ||
          sourceRef.current !== source
        ) {
          return;
        }
        setLoading(false);
        const target = remaining <= 2_000 ? 0 : volumeRef.current / 100;
        if (target > 0) fadeTo(target);
      } catch {
        if (action !== actionRef.current || audioRef.current !== audio) return;
        enabledRef.current = false;
        setEnabled(false);
        setLoading(false);
        setError("Your browser did not start ambient sound. You can try again.");
        release();
      }
    },
    [ensureAudio, fadeTo, release],
  );

  const enable = useCallback(
    (shouldPlay = true, remaining = Number.POSITIVE_INFINITY) => {
      if (enabledRef.current) return;
      const action = ++actionRef.current;
      enabledRef.current = true;
      setEnabled(true);
      setError(null);
      if (!shouldPlay || volumeRef.current === 0) return;
      void startPlayback(sourceRef.current, action, remaining);
    },
    [startPlayback],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabledRef.current) return;
    const action = ++actionRef.current;
    fadeTo(0, FADE_DURATION_MS, () => {
      if (action === actionRef.current && enabledRef.current && audioRef.current === audio) {
        audio.pause();
      }
    });
  }, [fadeTo]);

  const resume = useCallback(
    (remaining = Number.POSITIVE_INFINITY) => {
      if (!enabledRef.current || volumeRef.current === 0) return;
      const action = ++actionRef.current;
      const source = sourceRef.current;
      const audio = audioRef.current;
      if (!audio || loadedSourceRef.current !== source) {
        void startPlayback(source, action, remaining);
        return;
      }
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          if (action !== actionRef.current || !enabledRef.current || audioRef.current !== audio)
            return;
          if (remaining > 2_000) fadeTo(volumeRef.current / 100);
        })
        .catch(() => {
          if (action !== actionRef.current || audioRef.current !== audio) return;
          enabledRef.current = false;
          setEnabled(false);
          setError("Your browser did not resume ambient sound. You can try again.");
          release();
        });
    },
    [fadeTo, release, startPlayback],
  );

  const stop = useCallback(
    (afterStop?: () => void) => {
      const action = ++actionRef.current;
      enabledRef.current = false;
      setEnabled(false);
      setLoading(false);
      const audio = audioRef.current;
      if (!audio || audio.volume === 0) {
        release();
        afterStop?.();
        return;
      }
      fadeTo(0, FADE_DURATION_MS, () => {
        if (action !== actionRef.current) return;
        release();
        afterStop?.();
      });
    },
    [fadeTo, release],
  );

  const finish = useCallback(() => {
    actionRef.current += 1;
    enabledRef.current = false;
    setEnabled(false);
    setLoading(false);
    release();
  }, [release]);

  const fadeForCompletion = useCallback(
    (remaining: number) => {
      const audio = audioRef.current;
      if (!audio || !enabledRef.current || audio.volume === 0) return;
      const action = ++actionRef.current;
      fadeTo(0, Math.max(1, Math.min(FADE_DURATION_MS, remaining)), () => {
        if (action === actionRef.current && audioRef.current === audio) audio.pause();
      });
    },
    [fadeTo],
  );

  const setSource = useCallback(
    (source: string, shouldPlay: boolean, remaining = Number.POSITIVE_INFINITY) => {
      if (sourceRef.current === source) return;
      sourceRef.current = source;
      const action = ++actionRef.current;
      setError(null);
      const current = audioRef.current;
      const begin = () => {
        if (action !== actionRef.current) return;
        release();
        if (enabledRef.current && shouldPlay && volumeRef.current > 0) {
          void startPlayback(source, action, remaining);
        }
      };
      if (!current) {
        begin();
        return;
      }
      if (current.paused || current.volume === 0) {
        begin();
        return;
      }
      if (shouldPlay) setLoading(true);
      fadeTo(0, FADE_DURATION_MS, begin);
    },
    [fadeTo, release, startPlayback],
  );

  const setVolume = useCallback(
    (value: number) => {
      actionRef.current += 1;
      const next = Math.max(0, Math.min(100, Math.round(value)));
      volumeRef.current = next;
      setVolumeState(next);
      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
      } catch {
        // Persistence is optional.
      }
      const audio = audioRef.current;
      if (audio && enabledRef.current && !audio.paused) {
        cancelFade();
        audio.volume = next / 100;
      }
    },
    [cancelFade],
  );

  useEffect(() => {
    const value = savedVolume();
    volumeRef.current = value;
    setVolumeState(value);
  }, []);

  useEffect(
    () => () => {
      actionRef.current += 1;
      enabledRef.current = false;
      const audio = audioRef.current;
      if (!audio || audio.volume === 0) {
        release();
        return;
      }
      fadeTo(0, FADE_DURATION_MS, release);
    },
    [fadeTo, release],
  );

  return {
    enabled,
    loading,
    volume,
    error,
    enable,
    pause,
    resume,
    stop,
    finish,
    fadeForCompletion,
    setSource,
    setVolume,
  };
}

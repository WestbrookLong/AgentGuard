import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

interface Options {
  autoSpeak: boolean;
  onTranscript: (text: string) => Promise<string | undefined>;
  onError: (message: string) => void;
}

export function useVoiceConversation({ autoSpeak, onTranscript, onError }: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [continuous, setContinuousState] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number>();
  const continuousRef = useRef(false);
  const sendSegmentRef = useRef(true);
  const heardSpeechRef = useRef(false);
  const lastVoiceRef = useRef(0);
  const segmentStartedRef = useRef(0);
  const frameCountRef = useRef(0);

  const ensureStream = useCallback(async () => {
    if (streamRef.current?.active) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    audioContextRef.current = context;
    analyserRef.current = analyser;
    return stream;
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!autoSpeak || !text || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        utterance.rate = 1.02;
        utterance.pitch = 1.05;
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) || null;
        utterance.onstart = () => setStatus("speaking");
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      }),
    [autoSpeak],
  );

  const processBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 700) return;
      try {
        setStatus("transcribing");
        const bytes = await blob.arrayBuffer();
        const result = await window.pet.transcribe({ bytes, mimeType: blob.type || "audio/webm" });
        if (!result.text) return;
        setStatus("thinking");
        const response = await onTranscript(result.text);
        if (response) await speak(response);
      } catch (error) {
        setStatus("error");
        onError(error instanceof Error ? error.message : String(error));
      }
    },
    [onError, onTranscript, speak],
  );

  const startSegment = useCallback(async () => {
    const stream = await ensureStream();
    if (recorderRef.current?.state === "recording") return;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    heardSpeechRef.current = false;
    lastVoiceRef.current = Date.now();
    segmentStartedRef.current = Date.now();
    sendSegmentRef.current = true;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const shouldSend = sendSegmentRef.current && heardSpeechRef.current;
      recorderRef.current = null;
      if (shouldSend) await processBlob(blob);
      if (continuousRef.current) {
        setStatus("listening");
        window.setTimeout(() => void startSegment(), 180);
      } else {
        setStatus("idle");
      }
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setStatus(continuousRef.current ? "listening" : "recording");
  }, [ensureStream, processBlob]);

  const stopSegment = useCallback((send = true) => {
    sendSegmentRef.current = send;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const monitor = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      frameCountRef.current += 1;
      if (frameCountRef.current % 3 === 0) setLevel(Math.min(1, rms * 9));

      if (continuousRef.current && recorderRef.current?.state === "recording") {
        const now = Date.now();
        if (rms > 0.035) {
          heardSpeechRef.current = true;
          lastVoiceRef.current = now;
          setStatus("recording");
        }
        if (heardSpeechRef.current && now - lastVoiceRef.current > 1100 && now - segmentStartedRef.current > 800) {
          stopSegment(true);
        } else if (!heardSpeechRef.current && now - segmentStartedRef.current > 12_000) {
          stopSegment(false);
        }
      }
    }
    frameRef.current = requestAnimationFrame(monitor);
  }, [stopSegment]);

  const toggleManual = useCallback(async () => {
    if (continuousRef.current) return;
    if (recorderRef.current?.state === "recording") {
      heardSpeechRef.current = true;
      stopSegment(true);
      return;
    }
    try {
      await startSegment();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }, [onError, startSegment, stopSegment]);

  const setContinuous = useCallback(
    async (enabled: boolean) => {
      continuousRef.current = enabled;
      setContinuousState(enabled);
      if (enabled) {
        try {
          await startSegment();
        } catch (error) {
          continuousRef.current = false;
          setContinuousState(false);
          setStatus("error");
          onError(error instanceof Error ? error.message : String(error));
        }
      } else {
        stopSegment(false);
        window.speechSynthesis?.cancel();
        setStatus("idle");
      }
    },
    [onError, startSegment, stopSegment],
  );

  useEffect(() => {
    frameRef.current = requestAnimationFrame(monitor);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      continuousRef.current = false;
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, [monitor]);

  return { status, continuous, level, toggleManual, setContinuous };
}


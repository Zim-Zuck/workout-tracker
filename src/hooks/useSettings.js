import { useEffect, useState, useCallback } from 'react';
import { getSettings, setSetting } from '../db/database.js';

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  defaultRestSec: 120,
  defaultRepsLow: 8,
  defaultRepsHigh: 10,
  soundEnabled: true,
  vibrationEnabled: true
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...stored });
      setLoaded(true);
    })();
  }, []);

  const update = useCallback(async (patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      // Persist each changed key (settings store is key-value).
      for (const k of Object.keys(patch)) setSetting(k, next[k]);
      return next;
    });
  }, []);

  return { settings, updateSettings: update, settingsLoaded: loaded };
}

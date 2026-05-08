import firestore from '@react-native-firebase/firestore';

export interface AppVersionConfig {
  latestVersion: string;
  minRequiredVersion?: string;
  iosUrl: string;
  androidUrl: string;
  releaseNotes?: Record<string, string>;
}

export const fetchAppVersionConfig = async (): Promise<AppVersionConfig | null> => {
  try {
    const doc = await firestore().collection('config').doc('appVersion').get();
    if (!doc.exists) return null;
    return doc.data() as AppVersionConfig;
  } catch {
    return null;
  }
};

export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
};
